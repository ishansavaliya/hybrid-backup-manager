import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface Mailer {
  send(m: MailMessage): Promise<void>;
}

export interface SmtpEnv {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  /** Where enquiry notifications go (LEADS_NOTIFY_EMAIL, else SMTP_USER). */
  leadsTo: string;
}

/** SMTP settings, or null when email isn't configured (other features keep working). */
export function smtpEnv(): SmtpEnv | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host,
    port: Number.isFinite(port) ? port : 465,
    user,
    pass,
    from: process.env.SMTP_FROM || user,
    leadsTo: process.env.LEADS_NOTIFY_EMAIL || user,
  };
}

/** Sends through the owner's SMTP account (Gmail app password today). */
export function createSmtpMailer(e: SmtpEnv): Mailer {
  const transport = nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.port === 465,
    auth: { user: e.user, pass: e.pass },
  });
  return {
    async send(m) {
      await transport.sendMail({
        from: e.from,
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
        replyTo: m.replyTo,
      });
    },
  };
}
