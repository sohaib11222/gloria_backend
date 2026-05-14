import { prisma } from "../data/prisma.js";
import { generateCompanyCode } from "../infra/companyCode.js";
import { EMAIL_BRAND } from "../infra/emailBrand.js";
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
  /** Set `OTP_EMAIL_API_URL` in .env to use an external OTP mail API; if unset, `sendMail` is used (SendGrid/Resend HTTPS if keys set, else SMTP). */
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
    const subject = `Verify your email — ${EMAIL_BRAND.short}`;
    const message = `Hello ${companyName},\n\nThank you for registering with ${EMAIL_BRAND.full}. To complete your registration, please verify your email address using the one-time code we sent you.\n\nThis code expires in ${this.OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.\n\nIf you did not create an account, you can ignore this message.\n\n— ${EMAIL_BRAND.full}`;

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
          ? `⚠️  [EmailVerification] External API did not succeed — trying built-in mail (HTTPS API or SMTP)`
          : `📧 [EmailVerification] Sending OTP via built-in mail (HTTPS API or SMTP)`
      );
      console.log(`${'='.repeat(80)}`);
      console.log(`   Email: ${email}`);
      console.log(`   OTP: ${otp} (still stored in database)`);
      console.log(`   External API Error:`, externalApiError);
      console.log(`   Attempting sendMail...`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // Import sendMail for SMTP fallback
        const { sendMail } = await import("../infra/mailer.js");
        
        // Create HTML email with OTP
        const html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email verification — ${EMAIL_BRAND.full}</title>
            <style>
              body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.55; color: #1e293b; background-color: #f1f5f9; }
              .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
              .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); }
              .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #f8fafc; padding: 28px 24px; text-align: center; }
              .header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
              .header .tag { font-size: 13px; opacity: 0.88; margin: 8px 0 0; font-weight: 400; }
              .body { padding: 28px 24px 8px; }
              .body h2 { font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #0f172a; }
              .body p { margin: 0 0 16px; font-size: 15px; color: #475569; }
              .otp-wrap { margin: 24px 0; }
              .otp-code {
                display: block;
                background: #0f172a;
                color: #f8fafc;
                font-size: 28px;
                font-weight: 700;
                text-align: center;
                letter-spacing: 0.35em;
                padding: 20px 16px;
                border-radius: 10px;
                font-variant-numeric: tabular-nums;
              }
              .note { font-size: 13px; color: #64748b; margin: 20px 0 0; padding-top: 16px; border-top: 1px solid #e2e8f0; }
              .note ul { margin: 8px 0 0; padding-left: 18px; }
              .note li { margin: 4px 0; }
              .footer { padding: 20px 24px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
              .footer a { color: #64748b; text-decoration: none; }
            </style>
          </head>
          <body>
            <div style="display:none;max-height:0;overflow:hidden;">Your verification code is inside. Expires in ${this.OTP_EXPIRY_MINUTES} minutes.</div>
            <div class="wrap">
              <div class="card">
                <div class="header">
                  <p class="logo">${EMAIL_BRAND.full}</p>
                  <p class="tag">Email verification</p>
                </div>
                <div class="body">
                  <h2>Hello, ${companyName}</h2>
                  <p>Thanks for signing up. Use the verification code below to confirm your email address and finish setting up your account.</p>
                  <div class="otp-wrap">
                    <div class="otp-code">${otp}</div>
                  </div>
                  <div class="note">
                    <strong style="color:#334155;">Please note</strong>
                    <ul>
                      <li>This code expires in <strong>${this.OTP_EXPIRY_MINUTES} minutes</strong>.</li>
                      <li>Do not share this code with anyone.</li>
                      <li>If you did not request this email, you can safely ignore it.</li>
                    </ul>
                  </div>
                </div>
                <div class="footer">
                  <p style="margin:0 0 8px;">This is an automated message from <strong style="color:#64748b;">${EMAIL_BRAND.full}</strong>.</p>
                  <p style="margin:0;">© ${new Date().getFullYear()} ${EMAIL_BRAND.full}. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendMail({
          to: email,
          subject,
          html,
        });

        console.log(`\n${'='.repeat(80)}`);
        console.log(`✅ [EmailVerification] OTP email sent successfully (built-in mail)`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   OTP: ${otp}`);
        console.log(`   Method: sendMail (HTTPS API if configured, else SMTP)`);
        console.log(`${'='.repeat(80)}\n`);
        return otp;
      } catch (smtpError: any) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`❌ [EmailVerification] OTP email was not sent`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   OTP: ${otp} (still stored in database)`);
        console.log(`   External API Error:`, externalApiError);
        console.log(`   Mail error: ${smtpError.message}`);
        console.log(`   Note: OTP is still valid and stored. User can request resend.`);
        console.log(`   User can use resend-otp endpoint to try again.`);
        console.log(`${'='.repeat(80)}\n`);

        const smtpSan = sanitizeTransportError(smtpError);
        const mailStep =
          smtpSan.code === "HTTP_MAIL_API_FAILED" || smtpSan.code === "HTTP_MAIL_TIMEOUT"
            ? "https_mail_api"
            : "smtp";
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
          step: mailStep,
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
