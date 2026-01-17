import nodemailer from "nodemailer";
import { prisma } from "../data/prisma.js";
let cachedTransporter = null;
let transporterCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute cache
// Create transporter based on admin configuration or environment variables
async function createTransporter() {
    const now = Date.now();
    // Return cached transporter if still valid
    if (cachedTransporter && (now - transporterCacheTime) < CACHE_TTL) {
        return cachedTransporter;
    }
    // Try to get admin-configured SMTP first
    // NOTE: Admin config takes priority over environment variables
    // If you want to use env vars, disable or delete the admin SMTP config
    const smtpConfig = await prisma.smtpConfig.findFirst({
        where: { enabled: true },
        orderBy: { updatedAt: 'desc' },
    });
    if (smtpConfig) {
        // Use admin-configured SMTP
        console.log(`📧 Using SMTP from admin configuration (env vars are ignored when admin config exists):`);
        console.log(`   Host: ${smtpConfig.host}`);
        console.log(`   Port: ${smtpConfig.port}`);
        console.log(`   User: ${smtpConfig.user}`);
        console.log(`   Secure: ${smtpConfig.secure}`);
        console.log(`   From Email: ${smtpConfig.fromEmail}`);
        cachedTransporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure, // true for TLS/SSL (465), false for STARTTLS (587)
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.password,
            },
            // Add connection timeout
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
        });
        // Verify connection
        try {
            await cachedTransporter.verify();
            console.log(`✅ SMTP connection verified successfully`);
        }
        catch (verifyError) {
            console.error(`❌ SMTP connection verification failed:`, verifyError.message);
            console.error(`   This means emails will fail to send. Please check your SMTP credentials in the admin panel.`);
            // Still return the transporter so we can try to send and get better error messages
        }
        transporterCacheTime = now;
        return cachedTransporter;
    }
    // Fallback to environment variables
    // Helper to trim quotes from env vars (dotenv sometimes includes them)
    const trimQuotes = (str) => {
        if (!str)
            return str;
        return str.replace(/^["']|["']$/g, '').trim();
    };
    const emailHost = trimQuotes(process.env.EMAIL_HOST);
    const emailPort = trimQuotes(process.env.EMAIL_PORT);
    const emailUser = trimQuotes(process.env.EMAIL_USER);
    const emailPass = trimQuotes(process.env.EMAIL_PASS);
    const emailSecure = trimQuotes(process.env.EMAIL_SECURE) === 'true';
    // Debug: Log what we found
    console.log(`📧 Checking SMTP configuration:`);
    console.log(`   EMAIL_HOST: ${emailHost ? '✓ Set' : '✗ Not set'}`);
    console.log(`   EMAIL_USER: ${emailUser ? '✓ Set' : '✗ Not set'}`);
    console.log(`   EMAIL_PASS: ${emailPass ? '✓ Set (hidden)' : '✗ Not set'}`);
    console.log(`   EMAIL_PORT: ${emailPort || '587 (default)'}`);
    console.log(`   EMAIL_SECURE: ${emailSecure}`);
    if (emailHost && emailUser && emailPass) {
        console.log(`📧 Using SMTP from environment variables:`);
        console.log(`   Host: ${emailHost}`);
        console.log(`   Port: ${emailPort || '587'}`);
        console.log(`   User: ${emailUser}`);
        console.log(`   Secure: ${emailSecure}`);
        cachedTransporter = nodemailer.createTransport({
            host: emailHost,
            port: parseInt(emailPort || '587', 10),
            secure: emailSecure, // true for 465, false for 587
            requireTLS: !emailSecure, // For port 587, require TLS/STARTTLS
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            // Add connection timeout
            connectionTimeout: 15000, // Increased for Gmail
            greetingTimeout: 15000,
            socketTimeout: 15000,
            // TLS settings for Gmail
            tls: {
                rejectUnauthorized: true, // Verify SSL certificate (recommended)
                minVersion: 'TLSv1.2' // Use TLS 1.2 or higher
            }
        });
        // Verify connection
        try {
            console.log(`🔍 Verifying SMTP connection...`);
            await cachedTransporter.verify();
            console.log(`✅ SMTP connection verified successfully`);
        }
        catch (verifyError) {
            console.error(`❌ SMTP connection verification failed:`);
            console.error(`   Error: ${verifyError.message}`);
            console.error(`   Code: ${verifyError.code || 'N/A'}`);
            console.error(`   Response Code: ${verifyError.responseCode || 'N/A'}`);
            console.error(`   Response: ${verifyError.response || 'N/A'}`);
            console.error(`   Command: ${verifyError.command || 'N/A'}`);
            console.error(`   This means emails will fail to send. Please check your SMTP credentials.`);
            console.error(`   For Gmail:`);
            console.error(`     1. Enable 2-Step Verification`);
            console.error(`     2. Generate an App Password: https://myaccount.google.com/apppasswords`);
            console.error(`     3. Use the App Password (16 characters) as EMAIL_PASS`);
            console.error(`     4. Make sure EMAIL_PASS in .env has NO quotes: EMAIL_PASS=obmfugyywnvxctez (not EMAIL_PASS="obmfugyywnvxctez")`);
            // Still return the transporter so we can try to send and get better error messages
        }
        transporterCacheTime = now;
        return cachedTransporter;
    }
    else {
        console.log(`⚠️  Missing required environment variables for SMTP:`);
        if (!emailHost)
            console.log(`   - EMAIL_HOST is required`);
        if (!emailUser)
            console.log(`   - EMAIL_USER is required`);
        if (!emailPass)
            console.log(`   - EMAIL_PASS is required`);
    }
    // Final fallback to console logging for development
    console.warn("\n" + "=".repeat(80));
    console.warn("⚠️  NO SMTP CONFIGURATION FOUND");
    console.warn("=".repeat(80));
    console.warn("   Emails will be logged to console only (NOT actually sent).");
    console.warn("");
    console.warn("   To enable real email sending, configure SMTP via:");
    console.warn("   1. Admin panel: POST /admin/smtp");
    console.warn("      Example: POST http://localhost:8080/admin/smtp");
    console.warn("      Body: {");
    console.warn("        host: 'smtp.gmail.com',");
    console.warn("        port: 587,");
    console.warn("        secure: false,");
    console.warn("        user: 'your-email@gmail.com',");
    console.warn("        password: 'your-app-password',");
    console.warn("        fromEmail: 'your-email@gmail.com',");
    console.warn("        fromName: 'Car Hire Middleware'");
    console.warn("      }");
    console.warn("");
    console.warn("   2. Environment variables in .env file:");
    console.warn("      EMAIL_HOST=smtp.gmail.com");
    console.warn("      EMAIL_PORT=587");
    console.warn("      EMAIL_USER=your-email@gmail.com");
    console.warn("      EMAIL_PASS=your-app-password");
    console.warn("      EMAIL_SECURE=false");
    console.warn("      EMAIL_FROM=your-email@gmail.com");
    console.warn("");
    console.warn("   For Gmail:");
    console.warn("   - Enable 2-Step Verification");
    console.warn("   - Generate App Password: https://myaccount.google.com/apppasswords");
    console.warn("   - Use the 16-character App Password (not your regular password)");
    console.warn("=".repeat(80) + "\n");
    cachedTransporter = nodemailer.createTransport({
        // Use stream transport for development (console output)
        streamTransport: true,
        newline: "unix",
        buffer: true,
        // Custom logger to show email content in console
        logger: {
            info: (info) => {
                if (info.message && info.message.includes('Message sent')) {
                    // This will be handled in sendMail function
                }
            },
            warn: console.warn,
            error: console.error,
            debug: () => { } // Suppress debug logs
        }
    });
    transporterCacheTime = now;
    return cachedTransporter;
}
// Get the current transporter (cached)
export async function getMailer() {
    return createTransporter();
}
// Invalidate the transporter cache (call this when SMTP config is updated)
export function invalidateMailerCache() {
    cachedTransporter = null;
    transporterCacheTime = 0;
}
// Legacy export for backward compatibility
export const mailer = {
    sendMail: async (opts) => {
        const transporter = await getMailer();
        return transporter.sendMail(opts);
    }
};
export async function sendMail(opts) {
    const transporter = await getMailer();
    // Get from email from admin config or env
    let fromEmail = opts.from || process.env.EMAIL_FROM || "no-reply@carhire.local";
    let fromName = "Car Hire Middleware";
    const smtpConfig = await prisma.smtpConfig.findFirst({
        where: { enabled: true },
        orderBy: { updatedAt: 'desc' },
    });
    if (smtpConfig) {
        fromEmail = smtpConfig.fromEmail || fromEmail;
        if (smtpConfig.fromName) {
            fromName = smtpConfig.fromName;
        }
    }
    else if (process.env.EMAIL_FROM) {
        fromEmail = process.env.EMAIL_FROM;
    }
    const from = smtpConfig?.fromName
        ? `${smtpConfig.fromName} <${fromEmail}>`
        : fromEmail;
    // Log email attempt with configuration info
    const usingEnvVars = !smtpConfig && !!process.env.EMAIL_HOST;
    const usingAdminConfig = !!smtpConfig;
    const usingStreamTransport = !smtpConfig && !process.env.EMAIL_HOST;
    console.log(`📧 Attempting to send email:`);
    console.log(`   To: ${opts.to}`);
    console.log(`   From: ${from}`);
    console.log(`   Subject: ${opts.subject}`);
    console.log(`   Config: ${usingAdminConfig ? 'Admin Panel' : usingEnvVars ? 'Environment Variables' : 'Console Mode (not actually sent)'}`);
    try {
        // Check if we're using streamTransport (development mode)
        const isStreamTransport = usingStreamTransport;
        const result = await transporter.sendMail({ ...opts, from });
        // If using streamTransport (development mode), log the email content
        if (isStreamTransport) {
            console.log("\n" + "=".repeat(80));
            console.log("📧 EMAIL SENT (Console Mode - Not Actually Sent)");
            console.log("=".repeat(80));
            console.log(`To: ${opts.to}`);
            console.log(`From: ${from}`);
            console.log(`Subject: ${opts.subject}`);
            console.log("-".repeat(80));
            // Extract OTP from HTML if present
            const otpMatch = opts.html.match(/<div class="otp-code">(\d{4})<\/div>/);
            if (otpMatch) {
                console.log(`\n🔑 OTP CODE: ${otpMatch[1]}\n`);
            }
            console.log("HTML Content:");
            console.log(opts.html);
            console.log("=".repeat(80) + "\n");
        }
        else {
            console.log(`✅ Email sent successfully to ${opts.to}`);
        }
        return result;
    }
    catch (error) {
        // Check if it's an SMTP authentication error
        const isSmtpAuthError = error.message?.includes('Username and Password not accepted') ||
            error.message?.includes('Invalid login') ||
            error.message?.includes('BadCredentials') ||
            error.code === 'EAUTH' ||
            error.responseCode === 535;
        if (isSmtpAuthError) {
            console.error("❌ SMTP Authentication Failed:");
            console.error(`   Email: ${opts.to}`);
            console.error(`   Error: ${error.message}`);
            console.error(`   Code: ${error.code || 'N/A'}`);
            console.error(`   Response Code: ${error.responseCode || 'N/A'}`);
            console.error(`   Response: ${error.response || 'N/A'}`);
            console.error(`   Solution:`);
            console.error(`     1. Check your EMAIL_USER and EMAIL_PASS in .env file`);
            console.error(`     2. For Gmail, use an App Password (16 characters) from https://myaccount.google.com/apppasswords`);
            console.error(`     3. Make sure EMAIL_PASS has NO quotes: EMAIL_PASS=obmfugyywnvxctez`);
            console.error(`     4. If using admin panel, verify credentials are correct`);
            // Create a more descriptive error message
            const authError = new Error(`SMTP authentication failed. Please check your SMTP credentials in the admin panel or environment variables. Error: ${error.message}`);
            authError.code = error.code;
            authError.responseCode = error.responseCode;
            throw authError;
        }
        else {
            console.error("❌ Failed to send email:");
            console.error("Error details:", {
                to: opts.to,
                subject: opts.subject,
                error: error.message,
                code: error.code,
                responseCode: error.responseCode,
                response: error.response,
                command: error.command,
            });
        }
        throw error;
    }
}
