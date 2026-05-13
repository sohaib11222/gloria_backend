/**
 * Map nodemailer / transport errors to stable API codes (no secrets, no raw SMTP chatter by default).
 */
export function sanitizeTransportError(err: unknown): { code: string; message: string } {
  const e = err as Record<string, unknown> | undefined;
  const msg = String(e?.message ?? err ?? "");
  const code = typeof e?.code === "string" ? e.code : "";
  const response = typeof e?.response === "string" ? e.response : "";

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
        "The connection to the mail server timed out. Many hosts use outgoing mail on port 465 (implicit TLS) at your domain, e.g. EMAIL_HOST=gloriaconnect.com EMAIL_PORT=465 EMAIL_SECURE=true. Outbound 587 can be blocked on some VPS networks.",
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
