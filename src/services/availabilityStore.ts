import { prisma } from "../data/prisma.js";

type JobStatus = "IN_PROGRESS" | "COMPLETE";

export interface CreateJobParams {
  agentId: string;
  agreementRefs: string[];
  payload: any;
}

export interface GetSinceResult<T = any> {
  request_id: string;
  status: JobStatus;
  new_items: T[];
  last_seq: number;
  responses_received: number;
  total_expected: number;
  timed_out_sources: string[];
  aggregate_etag: string; // simple hash string
}

export const AvailabilityStore = {
  async createJob(params: CreateJobParams): Promise<string> {
    const expected = await prisma.agreement.count({
      where: { agentId: params.agentId, status: "ACTIVE", agreementRef: { in: params.agreementRefs } },
    });
    const job = await prisma.availabilityJob.create({
      data: {
        agentId: params.agentId,
        criteriaJson: params.payload as any,
        status: expected > 0 ? "RUNNING" : "COMPLETE",
        expectedSources: expected,
      },
      select: { id: true },
    });
    return job.id;
  },

  async appendPartial(jobId: string, sourceId: string, items: any[], timedOut = false): Promise<void> {
    // We persist items; timedOut sources will be tracked via a synthetic error row if no items
    const seqBase = await this._nextSeq(jobId);
    if (items.length === 0) {
      await prisma.availabilityResult.create({
        data: {
          jobId,
          seq: seqBase,
          sourceId,
          offerJson: { error: timedOut ? "TIMEOUT" : "NO_RESULT", source_id: sourceId },
        },
      });
      return;
    }
    let seq = seqBase;
    for (const item of items) {
      await prisma.availabilityResult.create({
        data: { jobId, seq: seq++, sourceId, offerJson: item as any },
      });
    }
  },

  async markSourceDone(_jobId: string, _sourceId: string): Promise<void> {
    // With current schema, "done per source" is inferred by presence of at least one row.
    return;
  },

  async markJobComplete(jobId: string): Promise<void> {
    await prisma.availabilityJob.update({ where: { id: jobId }, data: { status: "COMPLETE" } });
  },

  async getJobSince(jobId: string, sinceSeq: number, waitMs: number): Promise<GetSinceResult> {
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const maxWait = clamp(Number(waitMs || 0), 0, 10000);

    const readOnce = async () => {
      const rows = await prisma.availabilityResult.findMany({
        where: { jobId, seq: { gt: Number(sinceSeq) } },
        orderBy: { seq: "asc" },
        take: 200,
      });
      const lastSeq = rows.length ? rows[rows.length - 1].seq : Number(sinceSeq);
      const job = await prisma.availabilityJob.findUnique({ where: { id: jobId } });
      const status: JobStatus = job && job.status === "RUNNING" ? "IN_PROGRESS" : "COMPLETE";
      const totalExpected = job?.expectedSources || 0;
      // Get all results for this job to determine which sources responded
      const allResults = await prisma.availabilityResult.findMany({
        where: { jobId },
        select: { sourceId: true, offerJson: true },
      });
      const distinctSources = new Set(allResults.map(r => r.sourceId));
      const responsesReceived = distinctSources.size;
      
      // Track timed-out sources: those with error "TIMEOUT" in their result
      const timedOutSources: string[] = [];
      for (const r of allResults) {
        const json = r.offerJson as any;
        if (json && json.error === "TIMEOUT") {
          if (!timedOutSources.includes(r.sourceId)) {
            timedOutSources.push(r.sourceId);
          }
        }
      }
      
      const aggregateEtag = `${jobId}:${lastSeq}:${responsesReceived}:${totalExpected}:${timedOutSources.length}`;
      return {
        request_id: jobId,
        status,
        new_items: rows.map((r) => r.offerJson as any),
        last_seq: lastSeq,
        responses_received: responsesReceived,
        total_expected: totalExpected,
        timed_out_sources: timedOutSources,
        aggregate_etag: aggregateEtag,
      };
    };

    // immediate first try
    let out = await readOnce();
    const step = 200;
    let waited = 0;
    while (out.new_items.length === 0 && out.status === "IN_PROGRESS" && waited < maxWait) {
      await new Promise((r) => setTimeout(r, step));
      waited += step;
      out = await readOnce();
    }
    return out;
  },

  async purgeExpiredJobs(ttlSeconds = 600): Promise<number> {
    const cutoff = new Date(Date.now() - ttlSeconds * 1000);
    const oldJobs = await prisma.availabilityJob.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
    });
    if (oldJobs.length === 0) return 0;
    const ids = oldJobs.map((j) => j.id);
    await prisma.availabilityResult.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.availabilityJob.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  },

  async _nextSeq(jobId: string): Promise<number> {
    const last = await prisma.availabilityResult.findFirst({
      where: { jobId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    return (last?.seq || 0) + 1;
  },
};


