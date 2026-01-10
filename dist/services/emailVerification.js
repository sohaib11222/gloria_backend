import { prisma } from "../data/prisma.js";
import { generateCompanyCode } from "../infra/companyCode.js";
import { sendMail } from "../infra/mailer.js";
export class EmailVerificationService {
    static OTP_LENGTH = 4;
    static OTP_EXPIRY_MINUTES = 10;
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
        // Send email
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
