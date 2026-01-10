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
    const smtpConfig = await prisma.smtpConfig.findFirst({
        where: { enabled: true },
        orderBy: { updatedAt: 'desc' },
    });
    if (smtpConfig) {
        // Use admin-configured SMTP
        cachedTransporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure, // true for TLS/SSL (465), false for STARTTLS (587)
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.password,
            },
        });
        transporterCacheTime = now;
        return cachedTransporter;
    }
    // Fallback to environment variables
    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const emailSecure = process.env.EMAIL_SECURE === 'true';
    if (emailHost && emailUser && emailPass) {
        cachedTransporter = nodemailer.createTransport({
            host: emailHost,
            port: parseInt(emailPort || '587'),
            secure: emailSecure,
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        });
        transporterCacheTime = now;
        return cachedTransporter;
    }
    // Final fallback to console logging for development
    cachedTransporter = nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true
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
        fromEmail = smtpConfig.fromEmail;
        if (smtpConfig.fromName) {
            fromName = smtpConfig.fromName;
        }
    }
    const from = smtpConfig?.fromName
        ? `${smtpConfig.fromName} <${fromEmail}>`
        : fromEmail;
    return transporter.sendMail({ ...opts, from });
}
