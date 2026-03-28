/**
 * @deprecated  Manus OAuth callback route — no longer used.
 * Authentication is now handled by the custom JWT system.
 * See: server/auth/router.ts (login, magic-link, TOTP procedures)
 *
 * This file is kept as a no-op stub to avoid breaking any stale imports.
 * It is safe to delete once you confirm no external tooling references it.
 */

import type { Express } from "express";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerOAuthRoutes(_app: Express): void {
  // No-op: OAuth routes are no longer registered.
  // Custom auth endpoints are exposed via tRPC at /api/trpc/auth.*
}
