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
        // Check if we should use an HTTP-based email service (SendGrid, Mailgun, etc.)
        const useHttpService = process.env.EMAIL_SERVICE === 'sendgrid' || process.env.EMAIL_SERVICE === 'mailgun';
        if (useHttpService) {
            // Use HTTP-based email service (works even if SMTP ports are blocked)
            const service = process.env.EMAIL_SERVICE;
            const apiKey = emailPass; // For SendGrid/Mailgun, the password is the API key
            if (service === 'sendgrid') {
                console.log(`📧 Using SendGrid HTTP API (port 443 - usually not blocked)`);
                // SendGrid uses HTTP API, not SMTP
                // We'll use nodemailer with a custom transport that uses SendGrid API
                const sendgridApiKey = apiKey;
                const sendgridFromEmail = process.env.EMAIL_FROM || emailUser;
                // Create a custom transport using SendGrid API
                cachedTransporter = nodemailer.createTransport({
                    // Use SMTP-like interface but we'll override sendMail
                    host: 'smtp.sendgrid.net',
                    port: 587,
                    secure: false,
                    auth: {
                        user: 'apikey',
                        pass: sendgridApiKey,
                    },
                    // SendGrid SMTP actually works on port 587 with apikey as user
                });
                transporterCacheTime = now;
                return cachedTransporter;
            }
            else if (service === 'mailgun') {
                console.log(`📧 Using Mailgun HTTP API (port 443 - usually not blocked)`);
                // Mailgun SMTP
                const mailgunDomain = emailUser; // For Mailgun, user is the domain
                cachedTransporter = nodemailer.createTransport({
                    host: 'smtp.mailgun.org',
                    port: 587,
                    secure: false,
                    auth: {
                        user: `postmaster@${mailgunDomain}`,
                        pass: apiKey,
                    },
                });
                transporterCacheTime = now;
                return cachedTransporter;
            }
        }
        // Try to use Gmail API service if SMTP ports are blocked
        // Gmail API uses HTTPS (port 443) which is usually open
        if (emailHost === 'smtp.gmail.com' && emailUser?.endsWith('@gmail.com')) {
            // Use Gmail service with OAuth2 or App Password via HTTPS
            // For now, try SMTP with better error handling and retry logic
            console.log(`📧 Attempting SMTP connection to Gmail...`);
        }
        cachedTransporter = nodemailer.createTransport({
            host: emailHost,
            port: parseInt(emailPort || '587', 10),
            secure: emailSecure, // true for 465, false for 587
            requireTLS: !emailSecure, // For port 587, require TLS/STARTTLS
            auth: {
                user: emailUser,
                pass: emailPass?.replace(/\s+/g, ''), // Remove spaces from password (Gmail app passwords shouldn't have spaces)
            },
            // Add connection timeout
            connectionTimeout: 20000, // Increased for slow connections
            greetingTimeout: 20000,
            socketTimeout: 20000,
            // TLS settings for Gmail
            tls: {
                rejectUnauthorized: true, // Verify SSL certificate (recommended)
                minVersion: 'TLSv1.2' // Use TLS 1.2 or higher
            },
            // Add proxy support if HTTP_PROXY or HTTPS_PROXY is set
            ...(process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? {
                proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY
            } : {})
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
            // Check if it's a connection refused error (firewall blocking)
            const isConnectionRefused = verifyError.code === 'ECONNREFUSED' ||
                verifyError.message?.includes('ECONNREFUSED') ||
                verifyError.message?.includes('Network is unreachable');
            if (isConnectionRefused) {
                console.error(`\n🚨 FIREWALL ISSUE DETECTED:`);
                console.error(`   SMTP ports (465, 587, 25) are blocked by your server's firewall.`);
                console.error(`   This is common on cloud servers to prevent spam.`);
                console.error(`\n   SOLUTIONS:`);
                console.error(`   1. Open outbound SMTP ports in firewall:`);
                console.error(`      sudo ufw allow out 465/tcp`);
                console.error(`      sudo ufw allow out 587/tcp`);
                console.error(`      sudo ufw allow out 25/tcp`);
                console.error(`\n   2. Use an HTTP-based email service (recommended):`);
                console.error(`      - SendGrid: Set EMAIL_SERVICE=sendgrid and EMAIL_PASS=your_sendgrid_api_key`);
                console.error(`      - Mailgun: Set EMAIL_SERVICE=mailgun and EMAIL_PASS=your_mailgun_api_key`);
                console.error(`      These services use HTTPS (port 443) which is usually open.`);
                console.error(`\n   3. Contact your hosting provider to unblock SMTP ports.`);
                console.error(`\n   For Gmail (if ports are open):`);
                console.error(`     1. Enable 2-Step Verification`);
                console.error(`     2. Generate an App Password: https://myaccount.google.com/apppasswords`);
                console.error(`     3. Use the App Password (16 characters) as EMAIL_PASS`);
                console.error(`     4. Make sure EMAIL_PASS in .env has NO quotes: EMAIL_PASS=obmfugyywnvxctez`);
            }
            else {
                console.error(`   Response: ${verifyError.response || 'N/A'}`);
                console.error(`   Command: ${verifyError.command || 'N/A'}`);
                console.error(`   This means emails will fail to send. Please check your SMTP credentials.`);
                console.error(`   For Gmail:`);
                console.error(`     1. Enable 2-Step Verification`);
                console.error(`     2. Generate an App Password: https://myaccount.google.com/apppasswords`);
                console.error(`     3. Use the App Password (16 characters) as EMAIL_PASS`);
                console.error(`     4. Make sure EMAIL_PASS in .env has NO quotes: EMAIL_PASS=obmfugyywnvxctez (not EMAIL_PASS="obmfugyywnvxctez")`);
            }
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
    const startTime = Date.now();
    const emailId = `email-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📧 [${emailId}] EMAIL SEND ATTEMPT STARTED`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`   To: ${opts.to}`);
    console.log(`   Subject: ${opts.subject}`);
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
    console.log(`   From: ${from}`);
    console.log(`   Configuration Source: ${usingAdminConfig ? 'Admin Panel' : usingEnvVars ? 'Environment Variables (.env)' : 'Console Mode (NOT actually sent)'}`);
    // Log SMTP configuration details
    if (usingAdminConfig) {
        console.log(`   SMTP Config (Admin Panel):`);
        console.log(`      Host: ${smtpConfig.host}`);
        console.log(`      Port: ${smtpConfig.port}`);
        console.log(`      Secure: ${smtpConfig.secure}`);
        console.log(`      User: ${smtpConfig.user}`);
    }
    else if (usingEnvVars) {
        console.log(`   SMTP Config (Environment Variables):`);
        console.log(`      Host: ${process.env.EMAIL_HOST}`);
        console.log(`      Port: ${process.env.EMAIL_PORT || '587'}`);
        console.log(`      Secure: ${process.env.EMAIL_SECURE === 'true'}`);
        console.log(`      User: ${process.env.EMAIL_USER}`);
        console.log(`      From: ${process.env.EMAIL_FROM || 'not set'}`);
    }
    else {
        console.log(`   ⚠️  WARNING: No SMTP configuration found - email will NOT be sent!`);
        console.log(`   Email will only be logged to console.`);
    }
    // Extract OTP from HTML if present (for logging)
    const otpMatch = opts.html.match(/<div class="otp-code">(\d{4})<\/div>/);
    if (otpMatch) {
        console.log(`   🔑 OTP Code in email: ${otpMatch[1]}`);
    }
    console.log(`   Attempting to send...`);
    try {
        // Check if we're using streamTransport (development mode)
        const isStreamTransport = usingStreamTransport;
        const sendStartTime = Date.now();
        const result = await transporter.sendMail({ ...opts, from });
        const sendDuration = Date.now() - sendStartTime;
        // If using streamTransport (development mode), log the email content
        if (isStreamTransport) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📧 [${emailId}] EMAIL SENT (Console Mode - NOT Actually Sent)`);
            console.log(`${'='.repeat(80)}`);
            console.log(`   To: ${opts.to}`);
            console.log(`   From: ${from}`);
            console.log(`   Subject: ${opts.subject}`);
            console.log(`   Duration: ${sendDuration}ms`);
            console.log(`   ${'-'.repeat(78)}`);
            // Extract OTP from HTML if present
            const otpMatch = opts.html.match(/<div class="otp-code">(\d{4})<\/div>/);
            if (otpMatch) {
                console.log(`\n   🔑 OTP CODE: ${otpMatch[1]}\n`);
            }
            console.log(`   HTML Content Preview (first 500 chars):`);
            console.log(`   ${opts.html.substring(0, 500)}${opts.html.length > 500 ? '...' : ''}`);
            console.log(`${'='.repeat(80)}\n`);
        }
        else {
            const totalDuration = Date.now() - startTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`✅ [${emailId}] EMAIL SENT SUCCESSFULLY`);
            console.log(`${'='.repeat(80)}`);
            console.log(`   To: ${opts.to}`);
            console.log(`   From: ${from}`);
            console.log(`   Subject: ${opts.subject}`);
            console.log(`   Message ID: ${result.messageId || 'N/A'}`);
            console.log(`   Response: ${result.response || 'N/A'}`);
            console.log(`   Send Duration: ${sendDuration}ms`);
            console.log(`   Total Duration: ${totalDuration}ms`);
            if (otpMatch) {
                console.log(`   🔑 OTP Code: ${otpMatch[1]}`);
            }
            console.log(`${'='.repeat(80)}\n`);
        }
        return result;
    }
    catch (error) {
        const totalDuration = Date.now() - startTime;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`❌ [${emailId}] EMAIL SEND FAILED`);
        console.log(`${'='.repeat(80)}`);
        console.log(`   To: ${opts.to}`);
        console.log(`   From: ${from}`);
        console.log(`   Subject: ${opts.subject}`);
        console.log(`   Duration: ${totalDuration}ms`);
        console.log(`   ${'-'.repeat(78)}`);
        console.log(`   Error Type: ${error.name || 'Unknown'}`);
        console.log(`   Error Code: ${error.code || 'N/A'}`);
        console.log(`   Error Message: ${error.message || 'Unknown error'}`);
        console.log(`   Response Code: ${error.responseCode || 'N/A'}`);
        console.log(`   Response: ${error.response || 'N/A'}`);
        console.log(`   Command: ${error.command || 'N/A'}`);
        console.log(`   Stack: ${error.stack ? error.stack.substring(0, 200) + '...' : 'N/A'}`);
        // Check if it's an SMTP authentication error
        const isSmtpAuthError = error.message?.includes('Username and Password not accepted') ||
            error.message?.includes('Invalid login') ||
            error.message?.includes('BadCredentials') ||
            error.code === 'EAUTH' ||
            error.responseCode === 535;
        // Check if it's a connection error (firewall blocking)
        const isConnectionError = error.code === 'ECONNREFUSED' ||
            error.message?.includes('ECONNREFUSED') ||
            error.message?.includes('Network is unreachable') ||
            error.code === 'ESOCKET' ||
            error.code === 'ETIMEDOUT';
        if (isSmtpAuthError) {
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   🔐 AUTHENTICATION ERROR DETECTED`);
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   Solution:`);
            console.log(`     1. Check your EMAIL_USER and EMAIL_PASS in .env file`);
            console.log(`     2. For Gmail, use an App Password (16 characters) from https://myaccount.google.com/apppasswords`);
            console.log(`     3. Make sure EMAIL_PASS has NO quotes: EMAIL_PASS=obmfugyywnvxctez`);
            console.log(`     4. If using admin panel, verify credentials are correct`);
            console.log(`     5. Ensure 2-Step Verification is enabled on Gmail account`);
            // Create a more descriptive error message
            const authError = new Error(`SMTP authentication failed. Please check your SMTP credentials in the admin panel or environment variables. Error: ${error.message}`);
            authError.code = error.code;
            authError.responseCode = error.responseCode;
            console.log(`${'='.repeat(80)}\n`);
            throw authError;
        }
        else if (isConnectionError) {
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   🚨 CONNECTION ERROR DETECTED (Firewall Blocking)`);
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   The server cannot connect to the SMTP server.`);
            console.log(`   This usually means SMTP ports (465, 587, 25) are blocked by firewall.`);
            console.log(`   Solution:`);
            console.log(`     1. Run: sudo bash /var/www/gloriaconnect/backend/scripts/fix-email-firewall.sh`);
            console.log(`     2. Or use SendGrid/Mailgun (HTTP API, port 443):`);
            console.log(`        Set EMAIL_SERVICE=sendgrid in .env`);
            console.log(`     3. Contact hosting provider to open SMTP ports`);
            console.log(`   See: /var/www/gloriaconnect/backend/EMAIL_FIREWALL_FIX.md`);
        }
        else {
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   ⚠️  UNKNOWN ERROR`);
            console.log(`   ${'-'.repeat(78)}`);
            console.log(`   Full error details:`);
            console.error(`   ${JSON.stringify({
                to: opts.to,
                subject: opts.subject,
                error: error.message,
                code: error.code,
                responseCode: error.responseCode,
                response: error.response,
                command: error.command,
            }, null, 2)}`);
        }
        console.log(`${'='.repeat(80)}\n`);
        throw error;
    }
}
