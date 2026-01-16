import { prisma } from "../data/prisma.js";
import { v4 as uuidv4 } from "uuid";
import { getAdapterForSource } from "../adapters/registry.js";
import { SourceHealthService } from "./health.js";
import { logger } from "../infra/logger.js";
import pLimit from "p-limit";
import crypto from "crypto";
const CONCURRENT_LIMIT = 10;
const ECHO_TIMEOUT_MS = 120000; // 120 seconds
const MAX_POLL_WAIT_MS = 10000; // 10 seconds max wait (client requirement)
/**
 * Submit an Echo request and dispatch to eligible sources
 */
export async function submitEcho(requestRef, agentId, agreementRef, payload) {
    // Validate agreement exists and is ACTIVE
    const agreement = await prisma.agreement.findFirst({
        where: {
            agentId,
            agreementRef,
            status: "ACTIVE",
        },
        select: { id: true, sourceId: true },
    });
    if (!agreement) {
        throw new Error("AGREEMENT_NOT_FOUND");
    }
    // Find eligible sources (agreements with ACTIVE status, source not excluded)
    const eligibleAgreements = await prisma.agreement.findMany({
        where: {
            agentId,
            status: "ACTIVE",
        },
        include: {
            source: {
                select: {
                    id: true,
                    status: true,
                    approvalStatus: true,
                },
            },
        },
    });
    // Filter out excluded sources
    const eligible = [];
    for (const ag of eligibleAgreements) {
        const isExcluded = await SourceHealthService.isSourceExcluded(ag.sourceId);
        if (!isExcluded && ag.source.status === "ACTIVE" && ag.source.approvalStatus === "APPROVED") {
            eligible.push({
                agreementId: ag.id,
                sourceId: ag.sourceId,
                agreementRef: ag.agreementRef,
            });
        }
    }
    const requestId = uuidv4();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + ECHO_TIMEOUT_MS);
    // Create EchoJob
    const echoJob = await prisma.echoJob.create({
        data: {
            id: uuidv4(),
            requestId,
            agentId,
            agreementId: agreement.id,
            status: "IN_PROGRESS",
            startedAt,
            expiresAt,
            totalExpected: eligible.length,
            responsesReceived: 0,
            timedOutSources: 0,
            lastSeq: 0,
        },
    });
    // Dispatch to sources concurrently
    const limit = pLimit(CONCURRENT_LIMIT);
    const dispatchPromises = eligible.map(({ sourceId, agreementRef: agRef }) => limit(async () => {
        const startTime = Date.now();
        try {
            const adapter = await getAdapterForSource(sourceId);
            // Call Echo method on adapter (we'll need to add this to the adapter interface)
            // For now, simulate with a timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ECHO_TIMEOUT_MS);
            try {
                // TODO: Implement actual Echo call on adapter
                // For now, we'll create a mock response
                const echoedMessage = payload.message;
                const echoedAttrs = payload.attrs;
                // Append EchoItem
                const job = await prisma.echoJob.findUnique({
                    where: { requestId },
                    select: { lastSeq: true },
                });
                const newSeq = (job?.lastSeq || BigInt(0)) + BigInt(1);
                await prisma.$transaction([
                    prisma.echoItem.create({
                        data: {
                            id: uuidv4(),
                            requestId,
                            seq: newSeq,
                            echoedMessage,
                            echoedAttrs,
                        },
                    }),
                    prisma.echoJob.update({
                        where: { requestId },
                        data: {
                            responsesReceived: { increment: 1 },
                            lastSeq: newSeq,
                        },
                    }),
                ]);
                clearTimeout(timeoutId);
                const latency = Date.now() - startTime;
                await SourceHealthService.recordMetric({
                    latency,
                    success: true,
                    sourceId,
                });
            }
            catch (error) {
                clearTimeout(timeoutId);
                const latency = Date.now() - startTime;
                await SourceHealthService.recordMetric({
                    latency,
                    success: false,
                    sourceId,
                });
                logger.warn({ sourceId, error: error.message }, "Echo dispatch failed");
            }
        }
        catch (error) {
            logger.error({ sourceId, error: error.message }, "Echo adapter error");
        }
    }));
    // Don't await - let it run in background
    Promise.allSettled(dispatchPromises).then(async () => {
        // Mark job as complete after timeout
        setTimeout(async () => {
            const job = await prisma.echoJob.findUnique({
                where: { requestId },
            });
            if (job && job.status === "IN_PROGRESS") {
                const timedOut = job.totalExpected - job.responsesReceived;
                await prisma.echoJob.update({
                    where: { requestId },
                    data: {
                        status: "COMPLETE",
                        timedOutSources: timedOut > 0 ? timedOut : 0,
                    },
                });
            }
        }, ECHO_TIMEOUT_MS);
    });
    return {
        requestId,
        totalExpected: eligible.length,
        expiresUnixMs: expiresAt.getTime(),
        recommendedPollMs: 1000, // 1 second
    };
}
/**
 * Get Echo results with long-poll support
 */
export async function getEchoResults(requestId, sinceSeq, waitMs) {
    const maxWait = Math.min(waitMs, MAX_POLL_WAIT_MS);
    const startTime = Date.now();
    // Check for new items immediately
    let job = await prisma.echoJob.findUnique({
        where: { requestId },
        include: {
            items: {
                where: {
                    seq: { gt: sinceSeq },
                },
                orderBy: { seq: "asc" },
            },
        },
    });
    if (!job) {
        throw new Error("REQUEST_NOT_FOUND");
    }
    // If we have new items, return immediately
    if (job.items.length > 0) {
        const aggregateEtag = generateEtag(requestId, job.lastSeq.toString());
        return {
            requestId,
            status: job.status === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS",
            newItems: job.items.map((item) => ({
                echoedMessage: item.echoedMessage,
                echoedAttrs: item.echoedAttrs || {},
            })),
            lastSeq: job.lastSeq,
            responsesReceived: job.responsesReceived,
            totalExpected: job.totalExpected,
            timedOutSources: job.timedOutSources,
            aggregateEtag,
        };
    }
    // Long-poll: wait for new items
    const pollInterval = 100; // Check every 100ms
    const endTime = startTime + maxWait;
    while (Date.now() < endTime) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        job = await prisma.echoJob.findUnique({
            where: { requestId },
            include: {
                items: {
                    where: {
                        seq: { gt: sinceSeq },
                    },
                    orderBy: { seq: "asc" },
                },
            },
        });
        if (job && job.items.length > 0) {
            const aggregateEtag = generateEtag(requestId, job.lastSeq.toString());
            return {
                requestId,
                status: job.status === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS",
                newItems: job.items.map((item) => ({
                    echoedMessage: item.echoedMessage,
                    echoedAttrs: item.echoedAttrs || {},
                })),
                lastSeq: job.lastSeq,
                responsesReceived: job.responsesReceived,
                totalExpected: job.totalExpected,
                timedOutSources: job.timedOutSources,
                aggregateEtag,
            };
        }
    }
    // Timeout - return current state
    if (!job) {
        throw new Error("REQUEST_NOT_FOUND");
    }
    const aggregateEtag = generateEtag(requestId, job.lastSeq.toString());
    return {
        requestId,
        status: job.status === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS",
        newItems: [],
        lastSeq: job.lastSeq,
        responsesReceived: job.responsesReceived,
        totalExpected: job.totalExpected,
        timedOutSources: job.timedOutSources,
        aggregateEtag,
    };
}
function generateEtag(requestId, lastSeq) {
    const hash = crypto.createHash("md5").update(`${requestId}:${lastSeq}`).digest("hex");
    return hash;
}
