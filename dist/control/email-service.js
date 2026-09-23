"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var email_service_exports = {};
__export(email_service_exports, {
  getEmailService: () => getEmailService,
  sendPasswordResetEmail: () => sendPasswordResetEmail,
  sendSecurityNotification: () => sendSecurityNotification
});
module.exports = __toCommonJS(email_service_exports);
var import_logger = require("../logger");
class DevEmailService {
  async send(msg) {
    const isProduction = process.env.NODE_ENV === "production";
    const devMode = !isProduction && process.env.AUTH_DEV_RESET_LINKS === "true";
    if (devMode) {
      const urls = msg.text.match(/https?:\/\/[^\s]+/g) || [];
      if (urls.length > 0) {
        import_logger.logger.info(`\u{1F4E7} [DEV EMAIL] To: ${msg.to}`);
        import_logger.logger.info(`\u{1F4E7} [DEV EMAIL] Subject: ${msg.subject}`);
        for (const url of urls) {
          import_logger.logger.info(`\u{1F517} [DEV EMAIL] Link: ${url}`);
        }
      } else {
        import_logger.logger.info(`\u{1F4E7} [DEV EMAIL] To: ${msg.to} | Subject: ${msg.subject}`);
        import_logger.logger.info(`\u{1F4E7} [DEV EMAIL] Body: ${msg.text}`);
      }
    } else {
      import_logger.logger.info(`\u{1F4E7} [DEV EMAIL] To: ${msg.to} | Subject: ${msg.subject}`);
    }
    return { success: true };
  }
}
class SmtpEmailService {
  host;
  port;
  user;
  pass;
  from;
  constructor(config) {
    this.host = config.host;
    this.port = config.port;
    this.user = config.user;
    this.pass = config.pass;
    this.from = config.from;
  }
  async send(msg) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransporter({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: {
          user: this.user,
          pass: this.pass
        }
      });
      await transporter.sendMail({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html
      });
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "SMTP send failed";
      import_logger.logger.error(`\u{1F4E7} SMTP error: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}
let emailService = null;
function getEmailService() {
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
      from: smtpFrom
    });
    import_logger.logger.info(`\u{1F4E7} Email service: SMTP (${smtpHost}:${smtpPort})`);
  } else {
    emailService = new DevEmailService();
    import_logger.logger.info("\u{1F4E7} Email service: Development (console logging)");
  }
  return emailService;
}
async function sendPasswordResetEmail(to, accountId, resetToken, baseUrl) {
  const service = getEmailService();
  const resetUrl = `${baseUrl}/auth/reset-password/${accountId}/${resetToken}`;
  const msg = {
    to,
    subject: "AshenAI \u2014 Password Reset Request",
    text: `You requested a password reset. Click the link below to reset your password:

${resetUrl}

This link expires in 1 hour. If you did not request this, please ignore this email.`,
    html: `<p>You requested a password reset. Click the link below to reset your password:</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`
  };
  return service.send(msg);
}
async function sendSecurityNotification(to, event, details) {
  const service = getEmailService();
  const msg = {
    to,
    subject: `AshenAI \u2014 Security Alert: ${event}`,
    text: `Security event: ${event}

Details: ${details}

If this was not you, please secure your account immediately.`,
    html: `<p><strong>Security event:</strong> ${event}</p>
<p><strong>Details:</strong> ${details}</p>
<p>If this was not you, please secure your account immediately.</p>`
  };
  return service.send(msg);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getEmailService,
  sendPasswordResetEmail,
  sendSecurityNotification
});
