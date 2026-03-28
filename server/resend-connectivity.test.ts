/**
 * resend-connectivity.test.ts
 * Validates that RESEND_API_KEY is a valid Resend credential by calling
 * the lightweight domains.list() endpoint (no email is sent).
 * Skipped automatically when RESEND_API_KEY is not set (dev mode).
 */
import { describe, it, expect } from "vitest";

describe("Resend API key", () => {
  it("is valid or not configured (dev mode)", async () => {
    const key = process.env.RESEND_API_KEY;

    if (!key) {
      // Dev mode — no key configured, skip validation
      console.log("[SKIP] RESEND_API_KEY not set — running in dev/console-log mode");
      expect(true).toBe(true);
      return;
    }

    // Dynamically import Resend so the test file doesn't fail to parse without the package
    const { Resend } = await import("resend");
    const resend = new Resend(key);

    // domains.list() is a lightweight read-only call that validates the key
    const { error } = await resend.domains.list();

    expect(error, `Resend API key rejected: ${error?.message}`).toBeNull();
  });
});
