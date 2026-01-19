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
        // Store OTP in database
        await prisma.company.update({
            where: { email },
            data: {
                emailOtp: otp,
                emailOtpExpires: expiresAt,
            },
        });
        // Prepare email content
        const subject = "Verify Your Email - Car Hire Middleware";
        const message = `Hello ${companyName}!\n\nThank you for registering with Car Hire Middleware. To complete your registration, please verify your email address using the OTP code provided.\n\nThis code will expire in ${this.OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.\n\nIf you have any questions, please contact our support team.`;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📧 [EmailVerification] Sending OTP Email via External API`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   Email: ${email}`);
        console.log(`   Company: ${companyName}`);
        console.log(`   OTP: ${otp}`);
        console.log(`   Expires: ${expiresAt.toISOString()}`);
        console.log(`   OTP stored in database: ✓`);
        console.log(`   API URL: ${this.OTP_EMAIL_API_URL}`);
        console.log(`${'='.repeat(80)}\n`);
        try {
            // Call external OTP email API
            const requestBody = {
                email: email,
                otp_code: otp,
                subject: subject,
                message: message,
            };
            const response = await fetch(this.OTP_EMAIL_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            const responseData = await response.json();
            if (!response.ok) {
                // Handle error responses
                const errorResponse = responseData;
                const errorMessage = errorResponse.message || `Failed to send OTP: HTTP ${response.status}`;
                console.log(`\n${'='.repeat(80)}`);
                console.log(`❌ [EmailVerification] OTP Email Send Failed`);
                console.log(`${'='.repeat(80)}`);
                console.log(`   Email: ${email}`);
                console.log(`   OTP: ${otp} (still stored in database)`);
                console.log(`   Status: ${response.status}`);
                console.log(`   Error: ${errorMessage}`);
                if (errorResponse.errors) {
                    console.log(`   Validation Errors:`, JSON.stringify(errorResponse.errors, null, 2));
                }
                console.log(`   Note: OTP is still valid and stored. User can request resend.`);
                console.log(`${'='.repeat(80)}\n`);
                throw new Error(errorMessage);
            }
            // Success response
            const successResponse = responseData;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`✅ [EmailVerification] OTP Email Sent Successfully`);
            console.log(`${'='.repeat(80)}`);
            console.log(`   Email: ${email}`);
            console.log(`   OTP: ${otp}`);
            console.log(`   Status: Email sent successfully via external API`);
            if (successResponse.data?.sent_at) {
                console.log(`   Sent at: ${successResponse.data.sent_at}`);
            }
            console.log(`${'='.repeat(80)}\n`);
        }
        catch (error) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`❌ [EmailVerification] OTP Email Send Failed`);
            console.log(`${'='.repeat(80)}`);
            console.log(`   Email: ${email}`);
            console.log(`   OTP: ${otp} (still stored in database)`);
            console.log(`   Error: ${error.message}`);
            console.log(`   Note: OTP is still valid and stored. User can request resend.`);
            console.log(`${'='.repeat(80)}\n`);
            // Re-throw with a cleaner message
            throw new Error(`Failed to send verification email: ${error.message}`);
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
