/**
 * Centralised environment-variable registry for the SennaVision Roku Platform.
 *
 * All env vars consumed by server code should be listed here so they are
 * easy to audit and document.
 *
 * ─── Required ────────────────────────────────────────────────────────────────
 *   JWT_SECRET        — Session cookie signing secret (min 32 chars recommended)
 *   DATABASE_URL      — MySQL 8 connection string
 *
 * ─── Email (Resend) ──────────────────────────────────────────────────────────
 *   RESEND_API_KEY    — API key from https://resend.com
 *   RESEND_FROM       — Verified sender, e.g. "SennaVision <no-reply@yourdomain.com>"
 *   NOTIFICATION_EMAIL — Recipient for owner notifications (defaults to RESEND_FROM)
 *
 * ─── AI / LLM (OpenAI-compatible) ────────────────────────────────────────────
 *   OPENAI_API_KEY    — API key for OpenAI or compatible provider
 *   OPENAI_BASE_URL   — Base URL (default: https://api.openai.com/v1)
 *   OPENAI_MODEL      — Model name (default: gpt-4o-mini)
 *
 * ─── File Storage (S3-compatible) ────────────────────────────────────────────
 *   S3_BUCKET         — Bucket name (required for S3; absent = local /tmp fallback)
 *   S3_REGION         — AWS region (default: us-east-1)
 *   S3_ENDPOINT       — Custom endpoint for MinIO / Cloudflare R2 / etc.
 *   S3_PUBLIC_BASE_URL — Public base URL for uploaded files (optional)
 *   AWS_ACCESS_KEY_ID     — S3 access key
 *   AWS_SECRET_ACCESS_KEY — S3 secret key
 *
 * ─── Google OAuth ───────────────────────────────────────────────────────────
 *   GOOGLE_CLIENT_ID     — OAuth 2.0 client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — OAuth 2.0 client secret
 *
 * ─── Redis ───────────────────────────────────────────────────────────────────
 *   REDIS_URL         — Redis / Upstash connection string
 *
 * ─── Application ─────────────────────────────────────────────────────────────
 *   APP_URL           — Public base URL, e.g. https://platform.rilan.com
 *                       Used to build absolute URLs in emails and Roku feeds.
 *   NODE_ENV          — "production" | "development" (default: development)
 */

export const ENV = {
  /** Session signing secret — set via JWT_SECRET env var */
  cookieSecret: process.env.JWT_SECRET ?? "",

  /** MySQL / TiDB connection string */
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** Runtime environment */
  isProduction: process.env.NODE_ENV === "production",

  /**
   * Public base URL of this application (e.g. https://platform.rilan.com).
   * Used to build absolute URLs for Roku feed links, magic-link emails, etc.
   */
  appUrl: process.env.APP_URL ?? "",

  // ── Kept for backward compatibility with any remaining references ──────────
  // These were previously used by the Manus Forge proxy. They are now unused
  // but retained as empty strings so existing code that reads them doesn't
  // throw a "property does not exist" error at compile time.
  /** @deprecated Use OPENAI_API_KEY instead */
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** @deprecated Use OPENAI_BASE_URL instead */
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
};
