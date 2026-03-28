/**
 * Owner notification helper — self-hosted email delivery via Resend.
 *
 * Replaces the previous Manus Forge push-notification service.
 * Notifications are delivered as emails to NOTIFICATION_EMAIL (or
 * RESEND_FROM if NOTIFICATION_EMAIL is not set).
 *
 * Required env vars (same as the auth email helper):
 *   RESEND_API_KEY      — API key from https://resend.com
 *   RESEND_FROM         — Verified sender address
 *
 * Optional env vars:
 *   NOTIFICATION_EMAIL  — Recipient address for owner notifications.
 *                         Defaults to the address in RESEND_FROM.
 *
 * In dev mode (RESEND_API_KEY absent) the notification is logged to the
 * console and the function returns `true` so callers are not blocked.
 */

import { TRPCError } from "@trpc/server";
import { sendEmail } from "../auth/emailHelper.js";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

function getNotificationRecipient(): string {
  // Prefer a dedicated notification address; fall back to the sender address
  const explicit = process.env.NOTIFICATION_EMAIL;
  if (explicit?.trim()) return explicit.trim();

  // Extract plain email from "Name <email>" format
  const from = process.env.RESEND_FROM ?? "";
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from || "admin@example.com";
}

function buildNotificationEmail(title: string, content: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[RILAN Platform] ${title}`;

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
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">${title}</h1>
              <div style="font-size:15px;color:#a0a0a0;line-height:1.7;white-space:pre-wrap;">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#505050;">
                Sent at ${new Date().toUTCString()} &mdash; &copy; ${new Date().getFullYear()} RILAN Roku Content Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `[RILAN Platform Notification]\n\n${title}\n\n${content}\n\nSent at ${new Date().toUTCString()}`;

  return { subject, html, text };
}

/**
 * Delivers an owner notification via email (Resend).
 * Returns `true` on success, `false` when delivery fails (callers can fall
 * back to other channels). Validation errors bubble up as TRPCErrors.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  const to = getNotificationRecipient();
  const { subject, html, text } = buildNotificationEmail(title, content);

  try {
    await sendEmail({ to, subject, html, text });
    return true;
  } catch (error) {
    console.warn("[Notification] Failed to send owner notification email:", error);
    return false;
  }
}
