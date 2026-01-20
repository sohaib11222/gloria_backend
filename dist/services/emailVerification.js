import { prisma } from "../data/prisma.js";
import { generateCompanyCode } from "../infra/companyCode.js";
export class EmailVerificationService {
    static OTP_LENGTH = 4;
    static OTP_EXPIRY_MINUTES = 10;
    static OTP_EMAIL_API_URL = process.env.OTP_EMAIL_API_URL || "https://troosolar.hmstech.org/api/email/send-otp";
    /**
     * Generate a 4-digit OTP
     */
    static generateOTP() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }
    /**
     * Send OTP email to user
     */
    static async sendOTPEmail(email, companyName) {
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
        }
        catch (dbError) {
            console.log(`   ❌ Failed to store OTP in database: ${dbError.message}`);
            console.log(`${'='.repeat(80)}\n`);
            throw new Error(`Failed to store OTP: ${dbError.message}`);
        }
        // Prepare email content
        const subject = "Verify Your Email - Car Hire Middleware";
        const message = `Hello ${companyName}!\n\nThank you for registering with Car Hire Middleware. To complete your registration, please verify your email address using the OTP code provided.\n\nThis code will expire in ${this.OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.\n\nIf you have any questions, please contact our support team.`;
        console.log(`   API URL: ${this.OTP_EMAIL_API_URL}`);
        console.log(`   Attempting to send via external API...`);
        console.log(`${'='.repeat(80)}\n`);
        let externalApiSuccess = false;
        let externalApiError = null;
        // Try external API first
        try {
            const requestBody = {
                email: email,
                otp_code: otp,
                subject: subject,
                message: message,
            };
            console.log(`   [${attemptId}] Calling external API: ${this.OTP_EMAIL_API_URL}`);
            const startTime = Date.now();
            const response = await fetch(this.OTP_EMAIL_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody),
                // Add timeout
                signal: AbortSignal.timeout(30000), // 30 second timeout
            });
            const duration = Date.now() - startTime;
            const responseData = await response.json();
            console.log(`   [${attemptId}] API Response received (${duration}ms):`);
            console.log(`      Status: ${response.status}`);
            console.log(`      Response:`, JSON.stringify(responseData, null, 2));
            if (!response.ok) {
                // Handle error responses
                const errorResponse = responseData;
                const errorMessage = errorResponse.message || `Failed to send OTP: HTTP ${response.status}`;
                externalApiError = {
                    type: 'API_ERROR',
                    status: response.status,
                    message: errorMessage,
                    errors: errorResponse.errors,
                };
                console.log(`   [${attemptId}] ❌ External API returned error: ${errorMessage}`);
            }
            else {
                // Success response
                const successResponse = responseData;
                externalApiSuccess = true;
                console.log(`\n${'='.repeat(80)}`);
                console.log(`✅ [EmailVerification] OTP Email Sent Successfully via External API`);
                console.log(`${'='.repeat(80)}`);
                console.log(`   Email: ${email}`);
                console.log(`   OTP: ${otp}`);
                console.log(`   Status: Email sent successfully via external API`);
                console.log(`   Duration: ${duration}ms`);
                if (successResponse.data?.sent_at) {
                    console.log(`   Sent at: ${successResponse.data.sent_at}`);
                }
                console.log(`${'='.repeat(80)}\n`);
                return otp;
            }
        }
        catch (error) {
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
        // If external API failed, try SMTP fallback
        if (!externalApiSuccess) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`⚠️  [EmailVerification] External API Failed - Trying SMTP Fallback`);
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
            }
            catch (smtpError) {
                console.log(`\n${'='.repeat(80)}`);
                console.log(`❌ [EmailVerification] Both External API and SMTP Failed`);
                console.log(`${'='.repeat(80)}`);
                console.log(`   Email: ${email}`);
                console.log(`   OTP: ${otp} (still stored in database)`);
                console.log(`   External API Error:`, externalApiError);
                console.log(`   SMTP Error: ${smtpError.message}`);
                console.log(`   Note: OTP is still valid and stored. User can request resend.`);
                console.log(`   User can use resend-otp endpoint to try again.`);
                console.log(`${'='.repeat(80)}\n`);
                // Re-throw with details about both failures
                throw new Error(`Failed to send verification email. External API: ${externalApiError?.message || 'unknown'}, SMTP: ${smtpError.message}`);
            }
        }
        return otp; // Return for testing purposes
    }
    /**
     * Verify OTP code
     */
    static async verifyOTP(email, otp) {
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
    static async isEmailVerified(email) {
        const company = await prisma.company.findUnique({
            where: { email },
            select: { emailVerified: true },
        });
        return company?.emailVerified || false;
    }
    /**
     * Resend OTP (useful for expired OTPs)
     */
    static async resendOTP(email) {
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
    static async clearExpiredOTPs() {
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
