/**
 * server/auth/router.ts
 *
 * Custom authentication tRPC router — replaces Manus OAuth.
 *
 * Procedures:
 *   auth.login             — email + password (+ optional TOTP)
 *   auth.logout            — clear session cookie
 *   auth.me                — return current user (null if unauthenticated)
 *   auth.register          — admin-only: create a new user account
 *   auth.listUsers         — admin-only: list all users
 *   auth.updateUser        — admin-only: update name/role/isActive/mustChangePassword
 *   auth.deleteUser        — admin-only: deactivate a user account
 *   auth.changePassword    — authenticated: change own password
 *   auth.requestMagicLink  — public: request a magic-link login email
 *   auth.verifyMagicLink   — public: exchange token for session
 *   auth.setupTotp         — authenticated: generate TOTP secret + QR URI
 *   auth.verifyTotp        — authenticated: confirm TOTP code and enable 2FA
 *   auth.disableTotp       — authenticated: disable 2FA (requires password)
 */

import { z } from "zod";
import { sendEmail, buildMagicLinkEmail } from "./emailHelper";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  signSessionJwt,
  verifySessionJwt,
  isPasswordExpired,
  daysUntilPasswordExpiry,
  generateTotpSecret,
  getTotpUri,
  verifyTotp,
  generateMagicLinkToken,
  hashMagicLinkToken,
  magicLinkExpiresAt,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "./helpers";
import QRCode from "qrcode";
// ─── Helper: get raw drizzle connection (throws if DB unavailable) ──────────
async function requireDb() {
  const conn = await getDb();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return conn;
}

// ─── Helper: safe user projection (never expose passwordHash / totpSecret) ───

function safeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    openId: u.openId,
    name: u.name,
    email: u.email,
    role: u.role,
    totpEnabled: u.totpEnabled,
    mustChangePassword: u.mustChangePassword,
    isActive: u.isActive,
    passwordChangedAt: u.passwordChangedAt,
    lastSignedIn: u.lastSignedIn,
    createdAt: u.createdAt,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const customAuthRouter = router({
  // ── login ──────────────────────────────────────────────────────────────────
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
        totpToken: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }
      if (!user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account is disabled. Contact an administrator." });
      }

      const passwordOk = await verifyPassword(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }

      // TOTP check
      if (user.totpEnabled && user.totpSecret) {
        if (!input.totpToken) {
          // Signal to the frontend that a TOTP code is required
          return { requireTotp: true } as const;
        }
        const totpOk = verifyTotp(input.totpToken, user.totpSecret);
        if (!totpOk) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid 2FA code." });
        }
      }

      // Issue session JWT
      const token = await signSessionJwt({
        userId: user.id,
        openId: user.openId,
        role: user.role,
        name: user.name,
      });

      const cookieOpts = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOpts);

      // Update lastSignedIn
      await conn.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      return { requireTotp: false, user: safeUser(user) };
    }),

  // ── logout ─────────────────────────────────────────────────────────────────
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOpts = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOpts, maxAge: -1 });
    return { success: true };
  }),

  // ── me ─────────────────────────────────────────────────────────────────────
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const conn = await requireDb();
    const [user] = await conn.select().from(users).where(eq(users.id, (ctx.user as any).id)).limit(1);
    if (!user || !user.isActive) return null;
    const safe = safeUser(user);
    return {
      ...safe,
      passwordExpired: isPasswordExpired(user.passwordChangedAt),
      daysUntilPasswordExpiry: daysUntilPasswordExpiry(user.passwordChangedAt),
    };
  }),

  // ── register (admin-only) ──────────────────────────────────────────────────
  register: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(255),
        password: z.string().min(6, "Password must be at least 6 characters."),
        role: z.enum(["user", "admin", "content_manager", "publishing_manager"]).default("user"),
        mustChangePassword: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await requireDb();

      // Check for duplicate email
      const [existing] = await conn.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists." });
      }

      const passwordError = validatePassword(input.password);
      if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: passwordError });

      const passwordHash = await hashPassword(input.password);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      await conn.insert(users).values({
        openId,
        email: input.email,
        name: input.name,
        role: input.role,
        loginMethod: "password",
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: input.mustChangePassword,
        isActive: true,
        totpEnabled: false,
        lastSignedIn: new Date(),
      });

      const [created] = await conn.select().from(users).where(eq(users.email, input.email)).limit(1);
      return { success: true, user: safeUser(created!) };
    }),

  // ── listUsers (admin-only) ─────────────────────────────────────────────────
  listUsers: adminProcedure.query(async () => {
    const conn = await requireDb();
    const all = await conn.select().from(users).orderBy(users.createdAt);
    return all.map(safeUser);
  }),

  // ── updateUser (admin-only) ────────────────────────────────────────────────
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        name: z.string().min(1).max(255).optional(),
        role: z.enum(["user", "admin", "content_manager", "publishing_manager"]).optional(),
        isActive: z.boolean().optional(),
        mustChangePassword: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await requireDb();
      const updates: Partial<typeof users.$inferInsert> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.role !== undefined) updates.role = input.role;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      if (input.mustChangePassword !== undefined) updates.mustChangePassword = input.mustChangePassword;

      await conn.update(users).set(updates).where(eq(users.id, input.userId));
      const [updated] = await conn.select().from(users).where(eq(users.id, input.userId)).limit(1);
      return { success: true, user: safeUser(updated!) };
    }),

  // ── deleteUser (admin-only — soft delete via isActive=false) ───────────────
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if ((ctx.user as any).id === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
      }
      const conn = await requireDb();
      await conn.update(users).set({ isActive: false }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ── changePassword ─────────────────────────────────────────────────────────
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, "Password must be at least 6 characters."),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.id, (ctx.user as any).id)).limit(1);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account." });
      }

      const currentOk = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!currentOk) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      }

      const passwordError = validatePassword(input.newPassword);
      if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: passwordError });

      const newHash = await hashPassword(input.newPassword);
      await conn.update(users).set({
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      }).where(eq(users.id, (ctx.user as any).id));

      return { success: true };
    }),

  // ── requestMagicLink ───────────────────────────────────────────────────────
  requestMagicLink: publicProcedure
    .input(z.object({
      email: z.string().email(),
      /** Frontend must pass window.location.origin so the link works on any domain. */
      origin: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.email, input.email)).limit(1);

      // Always return success to prevent email enumeration
      if (!user || !user.isActive) return { success: true };

      const rawToken = generateMagicLinkToken();
      const hashedToken = hashMagicLinkToken(rawToken);
      const expiresAt = magicLinkExpiresAt();

      await conn.update(users).set({
        magicLinkToken: hashedToken,
        magicLinkExpiresAt: expiresAt,
      }).where(eq(users.id, user.id));

       // Build the full magic-link URL using the frontend's origin so the link
      // resolves correctly on any deployment domain.
      const MAGIC_LINK_EXPIRES_MINUTES = 15;
      const origin = input.origin ?? "";
      const magicUrl = `${origin}/auth/magic?token=${rawToken}&email=${encodeURIComponent(input.email)}`;

      // Send via SMTP when configured; falls back to console logging in dev mode.
      const emailContent = buildMagicLinkEmail({
        recipientName: user.name ?? input.email,
        magicLinkUrl: magicUrl,
        expiresInMinutes: MAGIC_LINK_EXPIRES_MINUTES,
      });
      await sendEmail({ to: input.email, ...emailContent });

      return { success: true };
    }),

  // ── verifyMagicLink ────────────────────────────────────────────────────────
  verifyMagicLink: publicProcedure
    .input(z.object({ email: z.string().email(), token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user || !user.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired magic link." });
      }

      const hashedToken = hashMagicLinkToken(input.token);
      const now = new Date();

      if (
        user.magicLinkToken !== hashedToken ||
        !user.magicLinkExpiresAt ||
        user.magicLinkExpiresAt < now
      ) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired magic link." });
      }

      // Consume the token
      await conn.update(users).set({
        magicLinkToken: null,
        magicLinkExpiresAt: null,
        lastSignedIn: new Date(),
      }).where(eq(users.id, user.id));

      const token = await signSessionJwt({
        userId: user.id,
        openId: user.openId,
        role: user.role,
        name: user.name,
      });

      const cookieOpts = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOpts);

      return { success: true, user: safeUser(user) };
    }),

  // ── setupTotp ──────────────────────────────────────────────────────────────
  setupTotp: protectedProcedure.mutation(async ({ ctx }) => {
    const conn = await requireDb();
    const [user] = await conn.select().from(users).where(eq(users.id, (ctx.user as any).id)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, user.email ?? user.openId);

    // Store the pending secret (not yet enabled — requires verifyTotp)
    await conn.update(users).set({ totpSecret: secret, totpEnabled: false }).where(eq(users.id, user.id));

    // Generate QR code as a data URL
    const qrDataUrl = await QRCode.toDataURL(uri);

    return { secret, uri, qrDataUrl };
  }),

  // ── verifyTotp (confirm setup) ─────────────────────────────────────────────
  verifyTotpSetup: protectedProcedure
    .input(z.object({ token: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.id, (ctx.user as any).id)).limit(1);
      if (!user || !user.totpSecret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No TOTP setup in progress. Call setupTotp first." });
      }

      const ok = verifyTotp(input.token, user.totpSecret);
      if (!ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid TOTP code. Please try again." });
      }

      await conn.update(users).set({ totpEnabled: true }).where(eq(users.id, user.id));
      return { success: true };
    }),

  // ── disableTotp ────────────────────────────────────────────────────────────
  disableTotp: protectedProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const conn = await requireDb();
      const [user] = await conn.select().from(users).where(eq(users.id, (ctx.user as any).id)).limit(1);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account." });
      }

      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
      }

      await conn.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, user.id));
      return { success: true };
    }),
});
