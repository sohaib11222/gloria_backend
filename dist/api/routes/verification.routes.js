import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../infra/auth.js";
import { requireCompanyType } from "../../infra/policies.js";
import { verificationClient } from "../../grpc/clients/verification.client.js";
import { metaFromReq } from "../../grpc/meta.js";
export const verificationRouter = Router();
/**
 * @openapi
 * /verification/source/run:
 *   post:
 *     tags: [Verification]
 *     summary: Run SOURCE verification (locations, availability, booking loop)
 *     description: Execute comprehensive verification for a SOURCE company including connectivity, locations, availability, and complete booking flow testing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               test_agreement_ref:
 *                 type: string
 *                 description: Test agreement reference for verification
 *                 example: "TEST-AGREEMENT"
 *     responses:
 *       200:
 *         description: Verification completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company_id:
 *                   type: string
 *                   description: Source company ID
 *                 kind:
 *                   type: string
 *                   enum: [SOURCE]
 *                   description: Verification type
 *                 passed:
 *                   type: boolean
 *                   description: Overall verification result
 *                 steps:
 *                   type: array
 *                   description: Detailed verification steps
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                         description: Step name
 *                       success:
 *                         type: boolean
 *                         description: Step success status
 *                       message:
 *                         type: string
 *                         description: Step result message
 *                       latency:
 *                         type: number
 *                         description: Step execution time in ms
 *                       details:
 *                         type: object
 *                         description: Additional step details
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: Verification completion time
 *       400:
 *         description: Invalid request or verification failed
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       403:
 *         description: Forbidden - not a SOURCE company
 */
verificationRouter.post("/verification/source/run", requireAuth(), requireCompanyType("SOURCE"), async (req, res, next) => {
    try {
        const schema = z.object({ test_agreement_ref: z.string().optional() });
        const body = schema.parse(req.body);
        const client = verificationClient();
        client.RunSourceVerification({
            source_id: req.user.companyId,
            test_agreement_ref: body.test_agreement_ref || "",
        }, metaFromReq(req), (err, resp) => (err ? next(err) : res.json(resp)));
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /verification/agent/run:
 *   post:
 *     tags: [Verification]
 *     summary: Run AGENT verification (booking loop against sandbox)
 *     description: Execute verification for an AGENT company by testing booking operations against sandbox environment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source_id:
 *                 type: string
 *                 description: Source ID to test against (defaults to sandbox)
 *                 example: "MOCK-SOURCE-ID"
 *               test_agreement_ref:
 *                 type: string
 *                 description: Test agreement reference for verification
 *                 example: "TEST-AGREEMENT"
 *     responses:
 *       200:
 *         description: Agent verification completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company_id:
 *                   type: string
 *                   description: Agent company ID
 *                 kind:
 *                   type: string
 *                   enum: [AGENT]
 *                   description: Verification type
 *                 passed:
 *                   type: boolean
 *                   description: Overall verification result
 *                 steps:
 *                   type: array
 *                   description: Detailed verification steps
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                         description: Step name
 *                       success:
 *                         type: boolean
 *                         description: Step success status
 *                       message:
 *                         type: string
 *                         description: Step result message
 *                       latency:
 *                         type: number
 *                         description: Step execution time in ms
 *                       details:
 *                         type: object
 *                         description: Additional step details
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: Verification completion time
 *       400:
 *         description: Invalid request or verification failed
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       403:
 *         description: Forbidden - not an AGENT company
 */
verificationRouter.post("/verification/agent/run", requireAuth(), requireCompanyType("AGENT"), async (req, res, next) => {
    try {
        const schema = z.object({
            source_id: z.string().optional(),
            test_agreement_ref: z.string().optional(),
        });
        const body = schema.parse(req.body);
        const client = verificationClient();
        client.RunAgentVerification({
            agent_id: req.user.companyId,
            source_id: body.source_id || "",
            test_agreement_ref: body.test_agreement_ref || "",
        }, metaFromReq(req), (err, resp) => (err ? next(err) : res.json(resp)));
    }
    catch (e) {
        next(e);
    }
});
/**
 * @openapi
 * /verification/status:
 *   get:
 *     tags: [Verification]
 *     summary: Get last verification status for the current company
 *     description: Retrieve the most recent verification status and results for the authenticated company
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company_id:
 *                   type: string
 *                   description: Company ID
 *                 kind:
 *                   type: string
 *                   enum: [SOURCE, AGENT]
 *                   description: Verification type
 *                 passed:
 *                   type: boolean
 *                   description: Overall verification result
 *                 steps:
 *                   type: array
 *                   description: Detailed verification steps
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                         description: Step name
 *                       success:
 *                         type: boolean
 *                         description: Step success status
 *                       message:
 *                         type: string
 *                         description: Step result message
 *                       latency:
 *                         type: number
 *                         description: Step execution time in ms
 *                       details:
 *                         type: object
 *                         description: Additional step details
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: Verification completion time
 *       404:
 *         description: No verification found for this company
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company_id:
 *                   type: string
 *                   description: Company ID
 *                 kind:
 *                   type: string
 *                   description: Empty verification type
 *                 passed:
 *                   type: boolean
 *                   description: Default verification result
 *                 steps:
 *                   type: array
 *                   description: Empty steps array
 *                 created_at:
 *                   type: string
 *                   description: Empty creation time
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
verificationRouter.get("/verification/status", requireAuth(), async (req, res, next) => {
    try {
        // For admin users without companyId, return empty status
        if (!req.user.companyId) {
            return res.json({
                status: 'INACTIVE',
                last_verified: null,
                report: null
            });
        }
        const client = verificationClient();
        client.GetVerificationStatus({ company_id: req.user.companyId }, metaFromReq(req), (err, resp) => {
            if (err)
                return next(err);
            // Transform gRPC response to match frontend expected format
            if (!resp || !resp.steps || resp.steps.length === 0) {
                return res.json({
                    status: 'INACTIVE',
                    last_verified: null,
                    report: null
                });
            }
            // Transform steps to test_results format
            const test_results = resp.steps.map((step) => ({
                name: step.name || '',
                description: step.detail || '',
                status: step.passed ? 'PASSED' : 'FAILED',
                duration_ms: 0, // Not available in gRPC response
                error: step.passed ? undefined : (step.detail || 'Test failed')
            }));
            const passed_tests = test_results.filter((t) => t.status === 'PASSED').length;
            const failed_tests = test_results.filter((t) => t.status === 'FAILED').length;
            return res.json({
                status: resp.passed ? 'ACTIVE' : 'INACTIVE',
                last_verified: resp.created_at || null,
                report: {
                    total_tests: test_results.length,
                    passed_tests,
                    failed_tests,
                    test_results,
                    errors: test_results.filter((t) => t.error).map((t) => t.error),
                    duration_ms: 0 // Not available in gRPC response
                }
            });
        });
    }
    catch (e) {
        next(e);
    }
});
