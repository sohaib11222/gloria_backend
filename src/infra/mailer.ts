import nodemailer from "nodemailer";

// Create transporter based on environment configuration
function createTransporter() {
  const emailHost = process.env.EMAIL_HOST;
  const emailPort = process.env.EMAIL_PORT;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const emailSecure = process.env.EMAIL_SECURE === 'true';

  // If SMTP credentials are provided, use SMTP
  if (emailHost && emailUser && emailPass) {
    return nodemailer.createTransport({
      host: emailHost,
      port: parseInt(emailPort || '587'),
      secure: emailSecure,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  // Fallback to console logging for development
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true
  });
}

export const mailer = createTransporter();

export function sendMail(opts: { to: string; subject: string; html: string; from?: string }) {
  const from = opts.from || process.env.EMAIL_FROM || "no-reply@carhire.local";
  return mailer.sendMail({ ...opts, from });
}
