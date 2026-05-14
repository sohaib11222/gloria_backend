import { prisma } from "../data/prisma.js";
import { sendMail } from "../infra/mailer.js";
import { EMAIL_BRAND } from "../infra/emailBrand.js";

export class PasswordResetService {
  private static readonly OTP_LENGTH = 4;
  private static readonly OTP_EXPIRY_MINUTES = 10;

  /**
   * Generate a 4-digit OTP for password reset
   */
  private static generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Send password reset OTP email
   */
  static async sendResetOTP(email: string): Promise<string> {
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

    const subject = `Reset your password — ${EMAIL_BRAND.short}`;

    // Send email
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password reset — ${EMAIL_BRAND.full}</title>
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.55; color: #1e293b; background-color: #f1f5f9; }
          .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
          .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); }
          .header { background: linear-gradient(135deg, #0f172a 0%, #422006 50%, #1e293b 100%); color: #f8fafc; padding: 28px 24px; text-align: center; }
          .header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
          .header .tag { font-size: 13px; opacity: 0.9; margin: 8px 0 0; font-weight: 400; }
          .body { padding: 28px 24px 8px; }
          .body h2 { font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #0f172a; }
          .body p { margin: 0 0 16px; font-size: 15px; color: #475569; }
          .otp-code {
            background: #0f172a;
            color: #f8fafc;
            font-size: 28px;
            font-weight: 700;
            text-align: center;
            letter-spacing: 0.35em;
            padding: 20px 16px;
            border-radius: 10px;
            margin: 22px 0;
            font-variant-numeric: tabular-nums;
          }
          .alert { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 16px; margin: 20px 0; font-size: 13px; color: #9a3412; }
          .alert ul { margin: 8px 0 0; padding-left: 18px; }
          .footer { padding: 20px 24px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div style="display:none;max-height:0;overflow:hidden;">Password reset code — expires in ${this.OTP_EXPIRY_MINUTES} minutes.</div>
        <div class="wrap">
          <div class="card">
            <div class="header">
              <p class="logo">${EMAIL_BRAND.full}</p>
              <p class="tag">Password reset</p>
            </div>
            <div class="body">
              <h2>Hello, ${user.company.companyName}</h2>
              <p>We received a request to reset the password for your ${EMAIL_BRAND.full} account. Use the code below to continue. If you did not request a reset, you can ignore this email — your password will stay the same.</p>
              <div class="otp-code">${otp}</div>
              <div class="alert">
                <strong>Security</strong>
                <ul>
                  <li>This code expires in <strong>${this.OTP_EXPIRY_MINUTES} minutes</strong>.</li>
                  <li>Never share this code with anyone. ${EMAIL_BRAND.full} will never ask for it by phone or chat.</li>
                  <li>If you did not request this, please secure your account and contact support.</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p style="margin:0 0 8px;">Automated message from <strong style="color:#64748b;">${EMAIL_BRAND.full}</strong></p>
              <p style="margin:0;">© ${new Date().getFullYear()} ${EMAIL_BRAND.full}. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendMail({
        to: email,
        subject,
        html,
      });
      console.log(`✅ Password reset OTP email sent to ${email} (OTP: ${otp})`);
    } catch (error: any) {
      console.error(`❌ Failed to send password reset OTP email to ${email}:`, error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    return otp; // Return for testing purposes
  }

  /**
   * Verify password reset OTP
   */
  static async verifyResetOTP(email: string, otp: string): Promise<boolean> {
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
  static async resetPassword(email: string, otp: string, newPassword: string): Promise<boolean> {
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

