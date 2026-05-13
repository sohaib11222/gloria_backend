import { prisma } from "../data/prisma.js";
import { generateCompanyCode } from "../infra/companyCode.js";
import { sanitizeTransportError, summarizeExternalOtpApiError } from "../infra/emailDeliveryError.js";
import crypto from "crypto";

interface OTPEmailApiSuccessResponse {
  status: "success";
  data: {
    email: string;
    sent_at: string;
  };
  message: string;
}

interface OTPEmailApiErrorResponse {
  status: "error";
  message: string;
  errors?: Record<string, string[]>;
}

type OTPEmailApiResponse = OTPEmailApiSuccessResponse | OTPEmailApiErrorResponse;

export class EmailVerificationService {
  private static readonly OTP_LENGTH = 4;
  private static readonly OTP_EXPIRY_MINUTES = 10;
  /** Set `OTP_EMAIL_API_URL` in .env to use an external OTP mail API; if unset, only SMTP (`EMAIL_*`) is used. */
  private static otpEmailApiUrl(): string {
    return (process.env.OTP_EMAIL_API_URL || "").trim();
  }

  /**
   * Generate a 4-digit OTP
   */
  private static generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Send OTP email to user
   */
  static async sendOTPEmail(email: string, companyName: string): Promise<string> {
    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
    const attemptId = `otp-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📧 [EmailVerification] Sending OTP Email - Attempt ${attemptId}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   Email: ${email}`);
    console.log(`   Company: ${companyName}`);
    console.log(`   OTP: ${otp}`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    const otpApiUrl = this.otpEmailApiUrl();
    console.log(`   OTP_EMAIL_API_URL: ${otpApiUrl ? "set (external API will be tried first)" : "not set (SMTP only)"}`);

    // Check if company exists before updating
    const existingCompany = await prisma.company.findUnique({
      where: { email },
      select: { id: true, emailOtp: true, emailVerified: true },
    });

    if (!existingCompany) {
      console.log(`   ⚠️  Company not found in database for email: ${email}`);
      console.log(`   This might be a timing issue - company may not be created yet`);
      console.log(`${'='.repeat(80)}\n`);
      throw new Error(`Company not found for email: ${email}. Please ensure registration completed successfully.`);
    }

    console.log(`   Company found: ✓ (ID: ${existingCompany.id})`);
    console.log(`   Previous OTP: ${existingCompany.emailOtp || 'none'}`);
    console.log(`   Email verified: ${existingCompany.emailVerified}`);

    // Store OTP in database
    try {
      await prisma.company.update({
        where: { email },
        data: {
          emailOtp: otp,
          emailOtpExpires: expiresAt,
        },
      });
      console.log(`   OTP stored in database: ✓`);
    } catch (dbError: any) {
      console.log(`   ❌ Failed to store OTP in database: ${dbError.message}`);
      console.log(`${'='.repeat(80)}\n`);
      throw new Error(`Failed to store OTP: ${dbError.message}`);
    }

    // Prepare email content
    const subject = "Verify Your Email - Car Hire Middleware";
    const message = `Hello ${companyName}!\n\nThank you for registering with Car Hire Middleware. To complete your registration, please verify your email address using the OTP code provided.\n\nThis code will expire in ${this.OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.\n\nIf you have any questions, please contact our support team.`;

    let externalApiSuccess = false;
    let externalApiError: any = null;

    if (otpApiUrl) {
      console.log(`   API URL: ${otpApiUrl}`);
      console.log(`   Attempting to send via external API...`);
      console.log(`${'='.repeat(80)}\n`);

      // Try external API first (only when configured)
      try {
        const requestBody = {
          email: email,
          otp_code: otp,
          subject: subject,
          message: message,
        };

        console.log(`   [${attemptId}] Calling external API: ${otpApiUrl}`);
        const startTime = Date.now();

        const response = await fetch(otpApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
          // Add timeout
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

      const duration = Date.now() - startTime;
      const contentType = response.headers.get("content-type") || "";
      const rawBody = await response.text();
      let responseData: OTPEmailApiResponse | null = null;
      let parseError: string | null = null;
      if (rawBody.trim()) {
        try {
          responseData = JSON.parse(rawBody) as OTPEmailApiResponse;
        } catch (e: any) {
          parseError = e?.message || "Invalid JSON";
        }
      }

      console.log(`   [${attemptId}] API Response received (${duration}ms):`);
      console.log(`      Status: ${response.status}`);
      console.log(`      Content-Type: ${contentType || "unknown"}`);
      if (responseData) {
        console.log(`      Response JSON:`, JSON.stringify(responseData, null, 2));
      } else {
        console.log(`      Response Text (first 400):`, rawBody.slice(0, 400));
        if (parseError) {
          console.log(`      JSON Parse Error: ${parseError}`);
        }
      }

      if (!response.ok) {
        // Handle error responses
        const errorResponse = responseData as OTPEmailApiErrorResponse | null;
        const errorMessage =
          errorResponse?.message ||
          rawBody.slice(0, 200) ||
          `Failed to send OTP: HTTP ${response.status}`;
        externalApiError = {
          type: 'API_ERROR',
          status: response.status,
          message: errorMessage,
          errors: errorResponse?.errors,
        };
        console.log(`   [${attemptId}] ❌ External API returned error: ${errorMessage}`);
      } else {
        // Success response:
        // - Prefer structured JSON when available
        // - But also accept successful non-JSON 2xx responses from third-party providers
        const successResponse = responseData as OTPEmailApiSuccessResponse | null;
        const apiReportedError = responseData && (responseData as any).status === "error";
        if (apiReportedError) {
          externalApiError = {
            type: "API_ERROR",
            status: response.status,
            message: (responseData as OTPEmailApiErrorResponse).message || "External API returned status=error",
            errors: (responseData as OTPEmailApiErrorResponse).errors,
          };
          console.log(`   [${attemptId}] ❌ External API returned status=error on HTTP ${response.status}`);
          console.log(`      Message: ${externalApiError.message}`);
          // Fall through to SMTP fallback
        } else {
        externalApiSuccess = true;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`✅ [EmailVerification] OTP Email Sent Successfully via External API`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   OTP: ${otp}`);
        console.log(`   Status: Email sent successfully via external API`);
        console.log(`   Duration: ${duration}ms`);
        if (successResponse?.data?.sent_at) {
          console.log(`   Sent at: ${successResponse.data.sent_at}`);
        }
        console.log(`${'='.repeat(80)}\n`);
        return otp;
        }
      }
    } catch (error: any) {
      externalApiError = {
        type: 'NETWORK_ERROR',
        message: error.message,
        code: error.code,
        name: error.name,
      };
      console.log(`   [${attemptId}] ❌ External API call failed:`, error.message);
      console.log(`      Error type: ${error.name || 'Unknown'}`);
      console.log(`      Error code: ${error.code || 'N/A'}`);
    }
    } else {
      console.log(`   [${attemptId}] OTP_EMAIL_API_URL not set — skipping external OTP API (SMTP only).`);
    }

    // If external API failed or was skipped, try SMTP fallback
    if (!externalApiSuccess) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(
        otpApiUrl
          ? `⚠️  [EmailVerification] External API did not succeed — trying SMTP fallback`
          : `📧 [EmailVerification] Sending OTP via SMTP`
      );
      console.log(`${'='.repeat(80)}`);
      console.log(`   Email: ${email}`);
      console.log(`   OTP: ${otp} (still stored in database)`);
      console.log(`   External API Error:`, externalApiError);
      console.log(`   Attempting SMTP fallback...`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // Import sendMail for SMTP fallback
        const { sendMail } = await import("../infra/mailer.js");
        
        // Create HTML email with OTP
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Email Verification - Car Hire Middleware</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
              .otp-code { 
                background: #1f2937; 
                color: #f9fafb; 
                font-size: 32px; 
                font-weight: bold; 
                text-align: center; 
                padding: 20px; 
                border-radius: 8px; 
                letter-spacing: 4px;
                margin: 20px 0;
              }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Car Hire Middleware</h1>
                <p>Email Verification Required</p>
              </div>
              <div class="content">
                <h2>Hello ${companyName}!</h2>
                <p>Thank you for registering with Car Hire Middleware. To complete your registration, please verify your email address using the OTP code below:</p>
                
                <div class="otp-code">${otp}</div>
                
                <p><strong>Important:</strong></p>
                <ul>
                  <li>This code will expire in ${this.OTP_EXPIRY_MINUTES} minutes</li>
                  <li>Do not share this code with anyone</li>
                  <li>If you didn't request this verification, please ignore this email</li>
                </ul>
                
                <p>If you have any questions, please contact our support team.</p>
              </div>
              <div class="footer">
                <p>This is an automated message from Car Hire Middleware</p>
                <p>© ${new Date().getFullYear()} Car Hire Middleware. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendMail({
          to: email,
          subject: "Verify Your Email - Car Hire Middleware",
          html,
        });

        console.log(`\n${'='.repeat(80)}`);
        console.log(`✅ [EmailVerification] OTP Email Sent Successfully via SMTP Fallback`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   OTP: ${otp}`);
        console.log(`   Method: SMTP (fallback after external API failed)`);
        console.log(`${'='.repeat(80)}\n`);
        return otp;
      } catch (smtpError: any) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`❌ [EmailVerification] OTP email was not sent`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   OTP: ${otp} (still stored in database)`);
        console.log(`   External API Error:`, externalApiError);
        console.log(`   SMTP Error: ${smtpError.message}`);
        console.log(`   Note: OTP is still valid and stored. User can request resend.`);
        console.log(`   User can use resend-otp endpoint to try again.`);
        console.log(`${'='.repeat(80)}\n`);

        const smtpSan = sanitizeTransportError(smtpError);
        const extSummary = externalApiError
          ? summarizeExternalOtpApiError(externalApiError)
          : otpApiUrl
            ? "external API did not succeed"
            : "external API was not configured";

        const err = new Error(smtpSan.message) as Error & {
          emailDelivery?: Record<string, unknown>;
        };
        err.emailDelivery = {
          code: smtpSan.code,
          message: smtpSan.message,
          step: "smtp",
          externalApiAttempted: !!otpApiUrl,
          externalApiSummary: otpApiUrl ? extSummary : undefined,
          ...(process.env.EXPOSE_EMAIL_DELIVERY_DETAILS === "true" && {
            technicalSmtp: smtpError?.message,
            technicalExternal: externalApiError,
          }),
        };
        throw err;
      }
    }

    return otp; // Return for testing purposes
  }

  /**
   * Verify OTP code
   */
  static async verifyOTP(email: string, otp: string): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { email },
      select: {
        id: true,
        emailOtp: true,
        emailOtpExpires: true,
        emailVerified: true,
        companyCode: true,
      },
    });

    if (!company) {
      return false;
    }

    // Check if already verified
    if (company.emailVerified) {
      return true;
    }

    // Check if OTP exists and is not expired
    if (!company.emailOtp || !company.emailOtpExpires) {
      return false;
    }

    if (new Date() > company.emailOtpExpires) {
      return false;
    }

    if (company.emailOtp !== otp) {
      return false;
    }

    // Generate company code if not already set (for Sources, required)
    let companyCode = company.companyCode;
    if (!companyCode) {
      companyCode = await generateCompanyCode(company.id);
    }

    // Mark email as verified and clear OTP, set company code
    await prisma.company.update({
      where: { email },
      data: {
        emailVerified: true,
        emailOtp: null,
        emailOtpExpires: null,
        status: "ACTIVE", // Activate the company after email verification
        companyCode: companyCode,
      },
    });

    return true;
  }

  /**
   * Check if email is verified
   */
  static async isEmailVerified(email: string): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { email },
      select: { emailVerified: true },
    });

    return company?.emailVerified || false;
  }

  /**
   * Resend OTP (useful for expired OTPs)
   */
  static async resendOTP(email: string): Promise<string> {
    const company = await prisma.company.findUnique({
      where: { email },
      select: { companyName: true, emailVerified: true },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    if (company.emailVerified) {
      throw new Error("Email already verified");
    }

    return await this.sendOTPEmail(email, company.companyName);
  }

  /**
   * Clear expired OTPs (cleanup job)
   */
  static async clearExpiredOTPs(): Promise<number> {
    const result = await prisma.company.updateMany({
      where: {
        emailOtpExpires: {
          lt: new Date(),
        },
        emailVerified: false,
      },
      data: {
        emailOtp: null,
        emailOtpExpires: null,
      },
    });

    return result.count;
  }
}
