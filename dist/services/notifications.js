import { prisma } from "../data/prisma.js";
import { sendMail } from "../infra/mailer.js";
export async function notifyAgreementDrafted(agreementId) {
    const ag = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: { agent: true, source: true }
    });
    if (!ag)
        return;
    // Notify the agent that a draft agreement has been created
    const to = ag.agent.email;
    const subject = `New Agreement Draft Created: ${ag.agreementRef}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">New Agreement Draft</h2>
      <p>Hello <b>${ag.agent.companyName}</b>,</p>
      <p>Source <b>${ag.source.companyName}</b> has created a draft agreement for you:</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Agreement Reference:</strong> ${ag.agreementRef}</p>
        <p><strong>Source:</strong> ${ag.source.companyName}</p>
        <p><strong>Status:</strong> DRAFT</p>
      </div>
      <p>This agreement is currently in draft status and will be offered to you once the source finalizes it.</p>
      <p>Best regards,<br>Car Hire Middleware Team</p>
    </div>
  `;
    await prisma.notification.create({
        data: {
            companyId: ag.agentId,
            type: "AGREEMENT_DRAFTED",
            title: subject,
            message: `Agreement ${ag.agreementRef} drafted by ${ag.source.companyName}`
        }
    });
    await sendMail({ to, subject, html });
}
export async function notifyAgreementOffered(agreementId) {
    const ag = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: { agent: true, source: true }
    });
    if (!ag)
        return;
    const to = ag.agent.email;
    const subject = `New Agreement Offered: ${ag.agreementRef}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">Agreement Offer Received</h2>
      <p>Hello <b>${ag.agent.companyName}</b>,</p>
      <p>Source <b>${ag.source.companyName}</b> has offered you a new agreement:</p>
      <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
        <p><strong>Agreement Reference:</strong> ${ag.agreementRef}</p>
        <p><strong>Source:</strong> ${ag.source.companyName}</p>
        <p><strong>Status:</strong> OFFERED</p>
      </div>
      <p>You can now review and accept this agreement through your dashboard.</p>
      <p>Best regards,<br>Car Hire Middleware Team</p>
    </div>
  `;
    await prisma.notification.create({
        data: {
            companyId: ag.agentId,
            type: "AGREEMENT_OFFERED",
            title: subject,
            message: `Agreement ${ag.agreementRef} offered by ${ag.source.companyName}`
        }
    });
    await sendMail({ to, subject, html });
}
export async function notifyAgreementAccepted(agreementId) {
    const ag = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: { agent: true, source: true }
    });
    if (!ag)
        return;
    const to = ag.source.email;
    const subject = `Agreement Accepted: ${ag.agreementRef}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Agreement Accepted</h2>
      <p>Hello <b>${ag.source.companyName}</b>,</p>
      <p>Great news! Agent <b>${ag.agent.companyName}</b> has accepted your agreement:</p>
      <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <p><strong>Agreement Reference:</strong> ${ag.agreementRef}</p>
        <p><strong>Agent:</strong> ${ag.agent.companyName}</p>
        <p><strong>Status:</strong> ACCEPTED</p>
      </div>
      <p>The agreement is now ready to be activated and used for bookings.</p>
      <p>Best regards,<br>Car Hire Middleware Team</p>
    </div>
  `;
    await prisma.notification.create({
        data: {
            companyId: ag.sourceId,
            type: "AGREEMENT_ACCEPTED",
            title: subject,
            message: `Agreement ${ag.agreementRef} accepted by ${ag.agent.companyName}`
        }
    });
    await sendMail({ to, subject, html });
}
export async function notifyAgreementStatus(agreementId, status) {
    const ag = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: { agent: true, source: true }
    });
    if (!ag)
        return;
    const subject = `Agreement ${ag.agreementRef} is now ${status}`;
    const html = `<p>Agreement <b>${ag.agreementRef}</b> status changed to <b>${status}</b>.</p>`;
    await prisma.notification.create({
        data: {
            companyId: ag.agentId,
            type: "AGREEMENT_STATUS",
            title: subject,
            message: `Agreement ${ag.agreementRef} status changed to ${status}`
        }
    });
    await prisma.notification.create({
        data: {
            companyId: ag.sourceId,
            type: "AGREEMENT_STATUS",
            title: subject,
            message: `Agreement ${ag.agreementRef} status changed to ${status}`
        }
    });
    await sendMail({ to: ag.agent.email, subject, html });
    await sendMail({ to: ag.source.email, subject, html });
}
