/**
 * server/auth/emailHelper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised email delivery for the RILAN Roku Platform using the Resend API.
 *
 * Required environment variables:
 *   RESEND_API_KEY  — API key from https://resend.com (starts with "re_")
 *   RESEND_FROM     — Verified sender address, e.g.:
 *                     "RILAN Platform <no-reply@yourdomain.com>"
 *                     Falls back to "onboarding@resend.dev" in dev mode.
 *
 * If RESEND_API_KEY is absent the helper logs the email to the console so the
 * application continues to function during local development without credentials.
 */

import { Resend } from "resend";

// ── Lazy-initialised Resend client ───────────────────────────────────────────
let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function getFromAddress(): string {
  return process.env.RESEND_FROM ?? "RILAN Platform <onboarding@resend.dev>";
}

// ── Public send interface ────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a transactional email via Resend.
 * Falls back to console.log when RESEND_API_KEY is not configured (dev mode).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const resend = getResend();

  if (!resend) {
    // Dev-mode fallback — log the email so developers can test flows without credentials
    console.log(
      `\n╔══════════════════════════════════════════════════╗\n` +
      `║  [Email] RESEND_API_KEY not set — dev mode log   ║\n` +
      `╠══════════════════════════════════════════════════╣\n` +
      `║  To      : ${opts.to}\n` +
      `║  Subject : ${opts.subject}\n` +
      `╠══════════════════════════════════════════════════╣\n` +
      `${opts.text}\n` +
      `╚══════════════════════════════════════════════════╝\n`
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  if (error) {
    throw new Error(`[Resend] Failed to send email to ${opts.to}: ${error.message}`);
  }

  console.log(`[Resend] Email sent to ${opts.to} — subject: "${opts.subject}"`);
}

// ── Email template builders ──────────────────────────────────────────────────

/**
 * Builds the magic-link sign-in email.
 */
export function buildMagicLinkEmail(opts: {
  recipientName: string;
  magicLinkUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const { recipientName, magicLinkUrl, expiresInMinutes } = opts;
  const subject = "Your RILAN Platform sign-in link";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #2a2a2a;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                &#128251; RILAN Platform
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;">
                Sign in to RILAN
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#a0a0a0;line-height:1.6;">
                Hi ${recipientName},<br/>
                Click the button below to sign in. This link is valid for
                <strong style="color:#ffffff;">${expiresInMinutes} minutes</strong>
                and can only be used once.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#6366f1;border-radius:8px;">
                    <a href="${magicLinkUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Sign in to RILAN &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#606060;line-height:1.5;">
                If the button doesn't work, copy and paste this URL into your browser:
              </p>
              <p style="margin:0;font-size:12px;color:#4a4a4a;word-break:break-all;
                         background:#111;padding:10px 12px;border-radius:6px;border:1px solid #222;">
                ${magicLinkUrl}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#505050;line-height:1.5;">
                If you didn't request this link, you can safely ignore this email.
                Your account will not be affected.<br/>
                &copy; ${new Date().getFullYear()} RILAN Roku Content Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Sign in to RILAN Platform

Hi ${recipientName},

Click the link below to sign in. This link expires in ${expiresInMinutes} minutes and can only be used once.

${magicLinkUrl}

If you didn't request this, you can safely ignore this email.

— RILAN Roku Content Platform`;

  return { subject, html, text };
}

/**
 * Builds the password-expiry warning / expired email.
 */
export function buildPasswordExpiryEmail(opts: {
  recipientName: string;
  recipientEmail: string;
  daysRemaining: number;
  changePasswordUrl: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, daysRemaining, changePasswordUrl } = opts;
  const isExpired = daysRemaining <= 0;

  const subject = isExpired
    ? "⚠️ Your RILAN Platform password has expired"
    : `Your RILAN Platform password expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;

  const accentColor = isExpired ? "#ef4444" : "#f59e0b";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #2a2a2a;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;">&#128251; RILAN Platform</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:${accentColor};">
                ${isExpired
                  ? "Password Expired"
                  : `Password Expires in ${daysRemaining} Day${daysRemaining === 1 ? "" : "s"}`}
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#a0a0a0;line-height:1.6;">
                Hi ${recipientName},<br/>
                ${isExpired
                  ? "Your RILAN Platform password has expired. Please update it now to regain access."
                  : `Your RILAN Platform password will expire in
                     <strong style="color:#ffffff;">${daysRemaining} day${daysRemaining === 1 ? "" : "s"}</strong>.
                     Update it before it expires to avoid being locked out.`}
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${accentColor};border-radius:8px;">
                    <a href="${changePasswordUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Change Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#505050;">
                &copy; ${new Date().getFullYear()} RILAN Roku Content Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${subject}

Hi ${recipientName},

${isExpired
  ? "Your RILAN Platform password has expired. Please update it now."
  : `Your password expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Update it before it expires.`}

${changePasswordUrl}

— RILAN Roku Content Platform`;

  return { subject, html, text };
}
