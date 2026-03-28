/**
 * Tests for the custom JWT authentication context (server/_core/context.ts).
 * Verifies that the Manus SDK dependency has been fully removed and replaced
 * with the local JWT verifier + DB lookup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { signSessionJwt, verifySessionJwt, COOKIE_NAME } from "./auth/helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockRequest(cookieValue?: string) {
  return {
    headers: {
      cookie: cookieValue ? `${COOKIE_NAME}=${cookieValue}` : undefined,
    },
  } as any;
}

// ─── JWT round-trip ───────────────────────────────────────────────────────────

describe("Custom auth context — JWT round-trip", () => {
  const secret = "test-secret-at-least-32-chars-long!!";

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it("signs a JWT and verifies it successfully", async () => {
    const token = await signSessionJwt({
      userId: 42,
      openId: "user-open-id-42",
      role: "admin",
      name: "Admin User",
    });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature

    const payload = await verifySessionJwt(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(42);
    expect(payload!.openId).toBe("user-open-id-42");
    expect(payload!.role).toBe("admin");
    expect(payload!.name).toBe("Admin User");
  });

  it("returns null for a tampered token", async () => {
    const token = await signSessionJwt({ userId: 1, openId: "oid-1", role: "user", name: null });
    const tampered = token.slice(0, -4) + "xxxx";
    const result = await verifySessionJwt(tampered);
    expect(result).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const result = await verifySessionJwt("");
    expect(result).toBeNull();
  });

  it("returns null for undefined", async () => {
    const result = await verifySessionJwt(undefined as any);
    expect(result).toBeNull();
  });
});

// ─── sdk.ts is no longer used ────────────────────────────────────────────────

describe("Manus SDK removal", () => {
  it("sdk.authenticateRequest throws a deprecation error", async () => {
    const { sdk } = await import("./_core/sdk");
    await expect(sdk.authenticateRequest({})).rejects.toThrow(
      "authenticateRequest is deprecated"
    );
  });

  it("oauth.ts registerOAuthRoutes is a no-op stub", async () => {
    const { registerOAuthRoutes } = await import("./_core/oauth");
    const mockApp = { get: vi.fn(), post: vi.fn() };
    // Should not throw and should not register any routes
    expect(() => registerOAuthRoutes(mockApp as any)).not.toThrow();
    expect(mockApp.get).not.toHaveBeenCalled();
    expect(mockApp.post).not.toHaveBeenCalled();
  });
});

// ─── ENV cleanup ─────────────────────────────────────────────────────────────

describe("ENV object — OAuth fields removed", () => {
  it("ENV no longer exposes appId, oAuthServerUrl, or ownerOpenId", async () => {
    const { ENV } = await import("./_core/env");
    expect((ENV as any).appId).toBeUndefined();
    expect((ENV as any).oAuthServerUrl).toBeUndefined();
    expect((ENV as any).ownerOpenId).toBeUndefined();
  });

  it("ENV exposes appUrl for building absolute URLs", async () => {
    const { ENV } = await import("./_core/env");
    expect("appUrl" in ENV).toBe(true);
  });

  it("ENV still exposes cookieSecret, databaseUrl, isProduction, forgeApiUrl, forgeApiKey", async () => {
    const { ENV } = await import("./_core/env");
    expect("cookieSecret" in ENV).toBe(true);
    expect("databaseUrl" in ENV).toBe(true);
    expect("isProduction" in ENV).toBe(true);
    expect("forgeApiUrl" in ENV).toBe(true);
    expect("forgeApiKey" in ENV).toBe(true);
  });
});
