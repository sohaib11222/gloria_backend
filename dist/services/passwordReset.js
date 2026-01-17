import { prisma } from "../data/prisma.js";
import { sendMail } from "../infra/mailer.js";
export class PasswordResetService {
    static OTP_LENGTH = 4;
    static OTP_EXPIRY_MINUTES = 10;
    /**
     * Generate a 4-digit OTP for password reset
     */
    static generateOTP() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }
    /**
     * Send password reset OTP email
     */
    static async sendResetOTP(email) {
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });
        if (!user || !user.company) {
            throw new Error("User not found");
        }
        // Check if email is verified
        if (!user.company.emailVerified) {
            throw new Error("Email not verified. Please verify your email first.");
        }
        const otp = this.generateOTP();
        const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
        // Store reset OTP in company record (reusing emailOtp fields for password reset)
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
        <title>Password Reset - Car Hire Middleware</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
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
          .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Car Hire Middleware</h1>
            <p>Password Reset Request</p>
          </div>
          <div class="content">
            <h2>Hello ${user.company.companyName}!</h2>
            <p>We received a request to reset your password. Use the OTP code below to verify your identity and reset your password:</p>
            
            <div class="otp-code">${otp}</div>
            
            <div class="warning">
              <p><strong>Security Notice:</strong></p>
              <ul>
                <li>This code will expire in ${this.OTP_EXPIRY_MINUTES} minutes</li>
                <li>Do not share this code with anyone</li>
                <li>If you didn't request a password reset, please ignore this email</li>
                <li>Your password will remain unchanged if you don't use this code</li>
              </ul>
            </div>
            
            <p>If you have any questions or concerns, please contact our support team immediately.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Car Hire Middleware</p>
            <p>© ${new Date().getFullYear()} Car Hire Middleware. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        try {
            await sendMail({
                to: email,
                subject: "Password Reset Request - Car Hire Middleware",
                html,
            });
            console.log(`✅ Password reset OTP email sent to ${email} (OTP: ${otp})`);
        }
        catch (error) {
            console.error(`❌ Failed to send password reset OTP email to ${email}:`, error);
            throw new Error(`Failed to send password reset email: ${error.message}`);
        }
        return otp; // Return for testing purposes
    }
    /**
     * Verify password reset OTP
     */
    static async verifyResetOTP(email, otp) {
        const company = await prisma.company.findUnique({
            where: { email },
            select: {
                id: true,
                emailOtp: true,
                emailOtpExpires: true,
                emailVerified: true,
            },
        });
        if (!company) {
            return false;
        }
        // Check if email is verified (required for password reset)
        if (!company.emailVerified) {
            return false;
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
        // OTP is valid - don't clear it yet, it will be cleared when password is reset
        return true;
    }
    /**
     * Reset password after OTP verification
     */
    static async resetPassword(email, otp, newPassword) {
        // Verify OTP first
        const isValid = await this.verifyResetOTP(email, otp);
        if (!isValid) {
            return false;
        }
        // Get user to update password
        const user = await prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });
        if (!user || !user.company) {
            return false;
        }
        // Hash new password
        const { Auth } = await import("../infra/auth.js");
        const passwordHash = await Auth.hash(newPassword);
        // Update password in both user and company records
        await prisma.user.update({
            where: { email },
            data: { passwordHash },
        });
        await prisma.company.update({
            where: { email },
            data: {
                passwordHash,
                emailOtp: null, // Clear OTP after successful reset
                emailOtpExpires: null,
            },
        });
        console.log(`✅ Password reset successful for ${email}`);
        return true;
    }
}
