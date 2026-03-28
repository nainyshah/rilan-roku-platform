/**
 * server/auth/helpers.ts
 *
 * Pure helper functions for the custom authentication system.
 * No Express / tRPC imports here — keeps this file unit-testable.
 */

import bcrypt from "bcryptjs";
import { generateSecret as totpGenerateSecret, verifySync as totpVerifySync, generateURI } from "otplib";
import { createHmac, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "../_core/env";

// ─── Constants ────────────────────────────────────────────────────────────────

export { COOKIE_NAME } from "../../shared/const";
export const BCRYPT_ROUNDS = 12;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_EXPIRY_DAYS = 90;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Password helpers ─────────────────────────────────────────────────────────

/** Hash a plain-text password using bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Verify a plain-text password against a stored bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Validate password strength — returns an error message or null. */
export function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

/** Returns true if the password was last changed more than 90 days ago.
 *  A null passwordChangedAt means the user has never set a password → treat as expired.
 */
export function isPasswordExpired(passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt) return true; // never set → force change
  const ageMs = Date.now() - passwordChangedAt.getTime();
  return ageMs > PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

/** Returns days until password expires (minimum 0 when already expired). */
export function daysUntilPasswordExpiry(passwordChangedAt: Date | null): number | null {
  if (!passwordChangedAt) return null;
  const ageMs = Date.now() - passwordChangedAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(PASSWORD_EXPIRY_DAYS - ageDays));
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

export interface SessionPayload {
  userId: number;
  openId: string;
  role: string;
  name: string | null;
}

function getJwtSecret(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** Sign a session JWT containing user identity. */
export async function signSessionJwt(payload: SessionPayload): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({
    userId: payload.userId,
    openId: payload.openId,
    role: payload.role,
    name: payload.name ?? "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_TTL_MS) / 1000))
    .sign(secret);
}

/** Verify and decode a session JWT. Returns null on any failure. */
export async function verifySessionJwt(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const { userId, openId, role, name } = payload as Record<string, unknown>;
    if (typeof userId !== "number" || typeof openId !== "string" || typeof role !== "string") {
      return null;
    }
    return { userId, openId, role, name: typeof name === "string" ? name : null };
  } catch {
    return null;
  }
}

// ─── TOTP helpers ─────────────────────────────────────────────────────────────

/** Generate a new TOTP secret (base32). */
export function generateTotpSecret(): string {
  return totpGenerateSecret();
}

/** Generate the otpauth:// URI for QR code rendering. */
export function getTotpUri(secret: string, email: string, issuer = "RILAN Platform"): string {
  return generateURI({ label: email, secret, issuer });
}

/** Verify a 6-digit TOTP token against a secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    const result = totpVerifySync({ token, secret });
    return result.valid;
  } catch {
    return false;
  }
}

// ─── Magic-link helpers ───────────────────────────────────────────────────────

/** Generate a cryptographically random magic-link token (hex string). */
export function generateMagicLinkToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a magic-link token for safe DB storage (HMAC-SHA256). */
export function hashMagicLinkToken(token: string): string {
  return createHmac("sha256", ENV.cookieSecret || "fallback-secret")
    .update(token)
    .digest("hex");
}

/** Returns the expiry Date for a new magic-link token. */
export function magicLinkExpiresAt(): Date {
  return new Date(Date.now() + MAGIC_LINK_TTL_MS);
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

import type { Request } from "express";

/** Build secure cookie options appropriate for the current environment. */
export function getSessionCookieOptions(req: Request) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
