/**
 * EmailService abstraction — provider-independent email delivery interface.
 *
 * In development, emails are logged to console / exposed via env var.
 * In production, plug in any SMTP, SendGrid, AWS SES, etc. provider.
 */

import crypto from "crypto";
import { logger } from "../logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(msg: EmailMessage): Promise<{ success: boolean; error?: string }>;
}

/* ================================================================
 * DEV EMAIL SERVICE (console logger + env var exposure)
 * ================================================================ */

class DevEmailService implements EmailService {
  async send(msg: EmailMessage): Promise<{ success: boolean; error?: string }> {
    const isProduction = process.env.NODE_ENV === "production";
    const devMode = !isProduction && process.env.AUTH_DEV_RESET_LINKS === "true";

    if (devMode) {
      // Extract any URLs from the message for console display
      const urls = msg.text.match(/https?:\/\/[^\s]+/g) || [];
      if (urls.length > 0) {
        logger.info(`📧 [DEV EMAIL] To: ${msg.to}`);
        logger.info(`📧 [DEV EMAIL] Subject: ${msg.subject}`);
        for (const url of urls) {
          logger.info(`🔗 [DEV EMAIL] Link: ${url}`);
        }
      } else {
        logger.info(`📧 [DEV EMAIL] To: ${msg.to} | Subject: ${msg.subject}`);
        logger.info(`📧 [DEV EMAIL] Body: ${msg.text}`);
      }
    } else {
      logger.info(`📧 [DEV EMAIL] To: ${msg.to} | Subject: ${msg.subject}`);
    }

    return { success: true };
  }
}

/* ================================================================
 * SMTP EMAIL SERVICE (production-ready, optional)
 * ================================================================ */

class SmtpEmailService implements EmailService {
  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private from: string;

  constructor(config: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  }) {
    this.host = config.host;
    this.port = config.port;
    this.user = config.user;
    this.pass = config.pass;
    this.from = config.from;
  }

  async send(msg: EmailMessage): Promise<{ success: boolean; error?: string }> {
    try {
      // Use require for optional nodemailer dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransporter({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: {
          user: this.user,
          pass: this.pass,
        },
      });

      await transporter.sendMail({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });

      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "SMTP send failed";
      logger.error(`📧 SMTP error: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}

/* ================================================================
 * SERVICE FACTORY
 * ================================================================ */

let emailService: EmailService | null = null;

export function getEmailService(): EmailService {
  if (emailService) return emailService;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom) {
    emailService = new SmtpEmailService({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    });
    logger.info(`📧 Email service: SMTP (${smtpHost}:${smtpPort})`);
  } else {
    emailService = new DevEmailService();
    logger.info("📧 Email service: Development (console logging)");
  }

  return emailService;
}

/**
 * Send a password reset email.
 * In dev mode with AUTH_DEV_RESET_LINKS=true, the link is logged to console.
 */
export async function sendPasswordResetEmail(
  to: string,
  accountId: string,
  resetToken: string,
  baseUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const service = getEmailService();
  const resetUrl = `${baseUrl}/auth/reset-password/${accountId}/${resetToken}`;

  const msg: EmailMessage = {
    to,
    subject: "AshenAI — Password Reset Request",
    text: `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
    html: `<p>You requested a password reset. Click the link below to reset your password:</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
  };

  return service.send(msg);
}

/**
 * Send a security notification (e.g., new login, MFA enabled/disabled).
 */
export async function sendSecurityNotification(
  to: string,
  event: string,
  details: string,
): Promise<{ success: boolean; error?: string }> {
  const service = getEmailService();

  const msg: EmailMessage = {
    to,
    subject: `AshenAI — Security Alert: ${event}`,
    text: `Security event: ${event}\n\nDetails: ${details}\n\nIf this was not you, please secure your account immediately.`,
    html: `<p><strong>Security event:</strong> ${event}</p>
<p><strong>Details:</strong> ${details}</p>
<p>If this was not you, please secure your account immediately.</p>`,
  };

  return service.send(msg);
}
