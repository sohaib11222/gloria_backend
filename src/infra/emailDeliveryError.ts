/**
 * Map nodemailer / transport errors to stable API codes (no secrets, no raw SMTP chatter by default).
 */
export function sanitizeTransportError(err: unknown): { code: string; message: string } {
  const e = err as Record<string, unknown> | undefined;
  const msg = String(e?.message ?? err ?? "");
  const code = typeof e?.code === "string" ? e.code : "";
  const response = typeof e?.response === "string" ? e.response : "";

  if (code === "EHTTP" || /SendGrid API HTTP|Resend API HTTP/i.test(msg)) {
    return {
      code: "HTTP_MAIL_API_FAILED",
      message:
        "The HTTPS mail provider rejected the request. Check SENDGRID_API_KEY or RESEND_API_KEY, and verify the sender domain or address is allowed for that provider.",
    };
  }
  if (
    (typeof e?.name === "string" && e.name === "AbortError") ||
    /AbortSignal\.timeout|The operation was aborted/i.test(msg)
  ) {
    return {
      code: "HTTP_MAIL_TIMEOUT",
      message:
        "The HTTPS mail request timed out. Check network access to api.sendgrid.com / api.resend.com (port 443).",
    };
  }
  if (
    code === "EAUTH" ||
    /535|authentication failed|invalid login|5\.7\.3|535 5\.7\.139/i.test(msg) ||
    /535 5\.7\.139/i.test(response)
  ) {
    return {
      code: "SMTP_AUTH_FAILED",
      message:
        "The mail server rejected the login. Use an app password for Microsoft 365, ensure SMTP AUTH is enabled for the mailbox, and that EMAIL_USER matches the mailbox.",
    };
  }
  if (code === "ECONNREFUSED" || /ECONNREFUSED|Network is unreachable/i.test(msg)) {
    return {
      code: "SMTP_CONNECTION_REFUSED",
      message:
        "This server could not open a connection to the SMTP host (outbound port 587/465 may be blocked by the host or cloud provider).",
    };
  }
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) {
    return {
      code: "SMTP_TIMEOUT",
      message:
        "The connection to the mail server timed out. Many hosts block outbound SMTP (465/587). Set SENDGRID_API_KEY or RESEND_API_KEY to send over HTTPS (port 443), or ask your host to allow outbound SMTP.",
    };
  }
  if (/554|550 5\.1\.1|mailbox unavailable|recipient rejected/i.test(msg + response)) {
    return {
      code: "SMTP_RECIPIENT_OR_POLICY",
      message: "The mail provider rejected the recipient or message (policy / relay / from-address).",
    };
  }
  if (/certificate|SSL|TLS|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(msg)) {
    return {
      code: "SMTP_TLS",
      message: "TLS negotiation with the mail server failed.",
    };
  }
  return {
    code: "SMTP_SEND_FAILED",
    message: "The verification email could not be sent. Try resend code or contact support.",
  };
}

export function summarizeExternalOtpApiError(err: unknown): string {
  const e = err as Record<string, unknown> | undefined;
  if (!e) return "unknown";
  if (typeof e.message === "string") return e.message.slice(0, 200);
  if (typeof e.type === "string" && typeof e.status === "number") {
    return `${e.type} HTTP ${e.status}`;
  }
  return String(err).slice(0, 200);
}
