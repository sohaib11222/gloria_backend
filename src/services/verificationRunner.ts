import { prisma } from "../data/prisma.js";
import { getAdapterForSource } from "../adapters/registry.js";
import { logger } from "../infra/logger.js";

export interface VerificationStep {
  step: string;
  success: boolean;
  message: string;
  latency: number;
  details?: any;
}

export interface VerificationResult {
  companyId: string;
  type: "SOURCE" | "AGENT";
  passed: boolean;
  steps: VerificationStep[];
  createdAt: string;
}

export class VerificationRunner {
  /**
   * Run comprehensive verification for a SOURCE company
   */
  static async runSourceVerification(
    sourceId: string,
    testAgreementRef: string = "TEST-AGREEMENT"
  ): Promise<VerificationResult> {
    const steps: VerificationStep[] = [];
    let overallPassed = true;

    try {
      // Step 1: Echo/Connectivity test (implicit)
      const echoStart = Date.now();
      try {
        // This is implicit - if we can get the adapter, connectivity is working
        const adapter = await getAdapterForSource(sourceId);
        const echoLatency = Date.now() - echoStart;
        
        steps.push({
          step: "echo",
          success: true,
          message: "Adapter connectivity successful",
          latency: echoLatency,
        });
      } catch (error) {
        const echoLatency = Date.now() - echoStart;
        steps.push({
          step: "echo",
          success: false,
          message: `Adapter connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: echoLatency,
        });
        overallPassed = false;
      }

      // Step 2: Locations test
      const locationsStart = Date.now();
      try {
        const adapter = await getAdapterForSource(sourceId);
        const locations = await adapter.locations();
        const locationsLatency = Date.now() - locationsStart;
        
        // Check if locations are valid UN/LOCODEs
        const validLocations = await prisma.uNLocode.count({
          where: { unlocode: { in: locations } },
        });
        
        const success = locations.length > 0 && validLocations > 0;
        steps.push({
          step: "locations",
          success,
          message: `Retrieved ${locations.length} locations, ${validLocations} valid UN/LOCODEs`,
          latency: locationsLatency,
          details: { total: locations.length, valid: validLocations },
        });
        
        if (!success) overallPassed = false;
      } catch (error) {
        const locationsLatency = Date.now() - locationsStart;
        steps.push({
          step: "locations",
          success: false,
          message: `Locations test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: locationsLatency,
        });
        overallPassed = false;
      }

      // Step 3: Availability test
      const availabilityStart = Date.now();
      try {
        const adapter = await getAdapterForSource(sourceId);
        const offers = await adapter.availability({
          pickup_unlocode: "GBMAN",
          dropoff_unlocode: "GBGLA",
          pickup_iso: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          dropoff_iso: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 days from now
          driver_age: 30,
          residency_country: "GB",
          vehicle_classes: [],
          agreement_ref: testAgreementRef,
        });
        
        const availabilityLatency = Date.now() - availabilityStart;
        const success = Array.isArray(offers) && offers.length > 0;
        
        steps.push({
          step: "availability",
          success,
          message: `Retrieved ${offers?.length || 0} availability offers`,
          latency: availabilityLatency,
          details: { offersCount: offers?.length || 0 },
        });
        
        if (!success) overallPassed = false;
      } catch (error) {
        const availabilityLatency = Date.now() - availabilityStart;
        steps.push({
          step: "availability",
          success: false,
          message: `Availability test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: availabilityLatency,
        });
        overallPassed = false;
      }

      // Step 4: Booking flow test (create → modify → check → cancel)
      const bookingFlowStart = Date.now();
      let bookingRef: string | null = null;
      
      try {
        const adapter = await getAdapterForSource(sourceId);
        
        // 4a: Create booking
        const createStart = Date.now();
        const createResult = await adapter.bookingCreate({
          agreement_ref: testAgreementRef,
          supplier_offer_ref: "SANDBOX-OFFER",
        });
        const createLatency = Date.now() - createStart;
        
        if (!createResult.supplier_booking_ref) {
          throw new Error("No booking reference returned from create");
        }
        
        bookingRef = createResult.supplier_booking_ref;
        steps.push({
          step: "booking_create",
          success: true,
          message: `Booking created with ref: ${bookingRef}`,
          latency: createLatency,
          details: { bookingRef, status: createResult.status },
        });

        // 4b: Modify booking - REQUIRED: agreement_ref must be sent
        const modifyStart = Date.now();
        const modifyResult = await adapter.bookingModify({
          supplier_booking_ref: bookingRef,
          agreement_ref: testAgreementRef,
        });
        const modifyLatency = Date.now() - modifyStart;
        
        steps.push({
          step: "booking_modify",
          success: true,
          message: `Booking modified successfully`,
          latency: modifyLatency,
          details: { status: modifyResult.status },
        });

        // 4c: Check booking - REQUIRED: agreement_ref must be sent
        const checkStart = Date.now();
        const checkResult = await adapter.bookingCheck(bookingRef, testAgreementRef);
        const checkLatency = Date.now() - checkStart;
        
        steps.push({
          step: "booking_check",
          success: true,
          message: `Booking check successful`,
          latency: checkLatency,
          details: { status: checkResult.status },
        });

        // 4d: Cancel booking - REQUIRED: agreement_ref must be sent
        const cancelStart = Date.now();
        const cancelResult = await adapter.bookingCancel(bookingRef, testAgreementRef);
        const cancelLatency = Date.now() - cancelStart;
        
        const cancelSuccess = cancelResult.status === "CANCELLED";
        steps.push({
          step: "booking_cancel",
          success: cancelSuccess,
          message: `Booking ${cancelSuccess ? 'cancelled' : 'cancel failed'} with status: ${cancelResult.status}`,
          latency: cancelLatency,
          details: { status: cancelResult.status },
        });
        
        if (!cancelSuccess) overallPassed = false;
        
        const bookingFlowLatency = Date.now() - bookingFlowStart;
        steps.push({
          step: "booking_flow",
          success: overallPassed,
          message: `Complete booking flow ${overallPassed ? 'passed' : 'failed'}`,
          latency: bookingFlowLatency,
          details: { totalSteps: 4 },
        });
        
      } catch (error) {
        const bookingFlowLatency = Date.now() - bookingFlowStart;
        steps.push({
          step: "booking_flow",
          success: false,
          message: `Booking flow failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: bookingFlowLatency,
          details: { bookingRef },
        });
        overallPassed = false;
      }

      // Save verification report
      const report = await prisma.verificationReport.create({
        data: {
          companyId: sourceId,
          kind: "SOURCE",
          passed: overallPassed,
          reportJson: steps as any,
        },
      });

      // Auto-activate if passed
      if (overallPassed) {
        await prisma.company.update({
          where: { id: sourceId },
          data: { status: "ACTIVE" },
        });
        logger.info({ sourceId }, "Source verification passed - company activated");
      }

      return {
        companyId: sourceId,
        type: "SOURCE",
        passed: overallPassed,
        steps,
        createdAt: report.createdAt.toISOString(),
      };

    } catch (error) {
      logger.error({ error, sourceId }, "Source verification failed");
      throw error;
    }
  }

  /**
   * Run comprehensive verification for an AGENT company
   */
  static async runAgentVerification(
    agentId: string,
    sourceId: string = "MOCK-SOURCE-ID",
    testAgreementRef: string = "TEST-AGREEMENT"
  ): Promise<VerificationResult> {
    const steps: VerificationStep[] = [];
    let overallPassed = true;

    try {
      // Verify agent exists and is correct type
      const agent = await prisma.company.findUnique({
        where: { id: agentId },
      });
      
      if (!agent || agent.type !== "AGENT") {
        throw new Error("Invalid agent or agent type");
      }

      // Step 1: Echo/Connectivity test
      const echoStart = Date.now();
      try {
        const adapter = await getAdapterForSource(sourceId);
        const echoLatency = Date.now() - echoStart;
        
        steps.push({
          step: "echo",
          success: true,
          message: "Sandbox adapter connectivity successful",
          latency: echoLatency,
        });
      } catch (error) {
        const echoLatency = Date.now() - echoStart;
        steps.push({
          step: "echo",
          success: false,
          message: `Sandbox connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: echoLatency,
        });
        overallPassed = false;
      }

      // Step 2: Booking flow test against sandbox
      const bookingFlowStart = Date.now();
      let bookingRef: string | null = null;
      
      try {
        const adapter = await getAdapterForSource(sourceId);
        
        // 2a: Create booking
        const createStart = Date.now();
        const createResult = await adapter.bookingCreate({
          agreement_ref: testAgreementRef,
          supplier_offer_ref: "SANDBOX-OFFER-AGENT",
        });
        const createLatency = Date.now() - createStart;
        
        if (!createResult.supplier_booking_ref) {
          throw new Error("No booking reference returned from create");
        }
        
        bookingRef = createResult.supplier_booking_ref;
        steps.push({
          step: "booking_create",
          success: true,
          message: `Sandbox booking created with ref: ${bookingRef}`,
          latency: createLatency,
          details: { bookingRef, status: createResult.status },
        });

        // 2b: Modify booking - REQUIRED: agreement_ref must be sent
        const modifyStart = Date.now();
        const modifyResult = await adapter.bookingModify({
          supplier_booking_ref: bookingRef,
          agreement_ref: testAgreementRef,
        });
        const modifyLatency = Date.now() - modifyStart;
        
        steps.push({
          step: "booking_modify",
          success: true,
          message: `Sandbox booking modified successfully`,
          latency: modifyLatency,
          details: { status: modifyResult.status },
        });

        // 2c: Check booking - REQUIRED: agreement_ref must be sent
        const checkStart = Date.now();
        const checkResult = await adapter.bookingCheck(bookingRef, testAgreementRef);
        const checkLatency = Date.now() - checkStart;
        
        steps.push({
          step: "booking_check",
          success: true,
          message: `Sandbox booking check successful`,
          latency: checkLatency,
          details: { status: checkResult.status },
        });

        // 2d: Cancel booking - REQUIRED: agreement_ref must be sent
        const cancelStart = Date.now();
        const cancelResult = await adapter.bookingCancel(bookingRef, testAgreementRef);
        const cancelLatency = Date.now() - cancelStart;
        
        const cancelSuccess = cancelResult.status === "CANCELLED";
        steps.push({
          step: "booking_cancel",
          success: cancelSuccess,
          message: `Sandbox booking ${cancelSuccess ? 'cancelled' : 'cancel failed'} with status: ${cancelResult.status}`,
          latency: cancelLatency,
          details: { status: cancelResult.status },
        });
        
        if (!cancelSuccess) overallPassed = false;
        
        const bookingFlowLatency = Date.now() - bookingFlowStart;
        steps.push({
          step: "booking_flow",
          success: overallPassed,
          message: `Complete sandbox booking flow ${overallPassed ? 'passed' : 'failed'}`,
          latency: bookingFlowLatency,
          details: { totalSteps: 4 },
        });
        
      } catch (error) {
        const bookingFlowLatency = Date.now() - bookingFlowStart;
        steps.push({
          step: "booking_flow",
          success: false,
          message: `Sandbox booking flow failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: bookingFlowLatency,
          details: { bookingRef },
        });
        overallPassed = false;
      }

      // Save verification report
      const report = await prisma.verificationReport.create({
        data: {
          companyId: agentId,
          kind: "AGENT",
          passed: overallPassed,
          reportJson: steps as any,
        },
      });

      // Auto-activate if passed
      if (overallPassed) {
        await prisma.company.update({
          where: { id: agentId },
          data: { status: "ACTIVE" },
        });
        logger.info({ agentId }, "Agent verification passed - company activated");
      }

      return {
        companyId: agentId,
        type: "AGENT",
        passed: overallPassed,
        steps,
        createdAt: report.createdAt.toISOString(),
      };

    } catch (error) {
      logger.error({ error, agentId }, "Agent verification failed");
      throw error;
    }
  }

  /**
   * Get the latest verification status for a company
   */
  static async getVerificationStatus(companyId: string): Promise<VerificationResult | null> {
    try {
      const report = await prisma.verificationReport.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      if (!report) {
        return null;
      }

      return {
        companyId,
        type: report.kind as "SOURCE" | "AGENT",
        passed: report.passed,
        steps: (report.reportJson as any) || [],
        createdAt: report.createdAt.toISOString(),
      };
    } catch (error) {
      logger.error({ error, companyId }, "Failed to get verification status");
      return null;
    }
  }
}
