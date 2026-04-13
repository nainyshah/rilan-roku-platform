/**
 * server/auth/googleOAuth.ts
 *
 * Google OAuth 2.0 integration using passport-google-oauth20.
 *
 * Registers two Express routes on the provided app:
 *   GET /api/auth/google           — redirect to Google consent screen
 *   GET /api/auth/google/callback  — handle Google callback, issue session cookie
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID     — OAuth 2.0 client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — OAuth 2.0 client secret
 *
 * The callback URL is constructed from the incoming request origin so it works
 * on both the dev tunnel URL and any custom production domain without hardcoding.
 */

import type { Express, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  signSessionJwt,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "./helpers";
import { writeAuditLog } from "../auditLog.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCallbackUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerGoogleOAuthRoutes(app: Express) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "[GoogleOAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — " +
        "Google login will be unavailable."
    );
    // Register stub routes that return a clear error instead of crashing
    app.get("/api/auth/google", (_req, res) => {
      res.status(503).json({
        error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      });
    });
    return;
  }

  // Passport requires a static callbackURL at strategy construction time.
  // We use a placeholder here and override it per-request via the
  // `callbackURL` option passed to passport.authenticate().
  const strategy = new GoogleStrategy(
    {
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: "/api/auth/google/callback", // overridden per-request below
      passReqToCallback: false,
    },
    // Verify callback — we handle DB upsert in the route handler instead
    (_accessToken, _refreshToken, profile, done) => done(null, profile)
  );

  passport.use("google", strategy);

  // ── Step 1: redirect to Google ─────────────────────────────────────────────
  app.get("/api/auth/google", (req, res, next) => {
    const callbackURL = getCallbackUrl(req);
    // Store the return path from query param (e.g. ?returnTo=/dashboard)
    const returnTo = (req.query.returnTo as string) || "/";
    // Encode returnTo in the state parameter so we can redirect after callback
    const state = Buffer.from(JSON.stringify({ returnTo, callbackURL })).toString("base64url");

    passport.authenticate("google", {
      scope: ["profile", "email"],
      callbackURL,
      state,
      session: false,
    } as Parameters<typeof passport.authenticate>[1])(req, res, next);
  });

  // ── Step 2: handle Google callback ────────────────────────────────────────
  app.get(
    "/api/auth/google/callback",
    (req, res, next) => {
      // Decode the callbackURL we stored in state so passport uses the same URL
      let callbackURL = getCallbackUrl(req);
      try {
        const raw = req.query.state as string;
        if (raw) {
          const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
          if (parsed.callbackURL) callbackURL = parsed.callbackURL;
        }
      } catch {
        // ignore — use derived callbackURL
      }

      passport.authenticate("google", {
        callbackURL,
        session: false,
        failureRedirect: "/login?error=google_failed",
      } as Parameters<typeof passport.authenticate>[1])(req, res, next);
    },
    async (req: Request, res: Response) => {
      try {
        // passport attaches the Google profile to req.user
        const profile = req.user as passport.Profile & {
          emails?: Array<{ value: string }>;
          displayName?: string;
        };

        if (!profile) {
          return res.redirect("/login?error=google_no_profile");
        }

        const googleId = profile.id;
        const email = profile.emails?.[0]?.value ?? null;
        const name = profile.displayName ?? email ?? "Google User";

        const conn = await getDb();
        if (!conn) {
          return res.redirect("/login?error=db_unavailable");
        }

        // Find existing user by googleId (stored in openId for google accounts)
        // or by matching email address
        let user = await (async () => {
          // First try: exact openId match (returning Google user)
          const [byOpenId] = await conn
            .select()
            .from(users)
            .where(eq(users.openId, `google:${googleId}`))
            .limit(1);
          if (byOpenId) return byOpenId;

          // Second try: email match (link to existing password/magic-link account)
          if (email) {
            const [byEmail] = await conn
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (byEmail) return byEmail;
          }

          return null;
        })();

        if (user) {
          // Update name and mark loginMethod if not already set
          if (!user.isActive) {
            return res.redirect("/login?error=account_disabled");
          }
          await conn
            .update(users)
            .set({
              name: user.name ?? name,
              loginMethod: user.loginMethod ?? "google",
              lastSignedIn: new Date(),
              // Link openId to google if this was an email-matched account
              openId: user.openId.startsWith("google:") ? user.openId : `google:${googleId}`,
            })
            .where(eq(users.id, user.id));
          // Re-fetch to get updated values
          const [updated] = await conn.select().from(users).where(eq(users.id, user.id)).limit(1);
          user = updated ?? user;
        } else {
          // Create new user
          const openId = `google:${googleId}`;
          await conn.insert(users).values({
            openId,
            name,
            email: email ?? undefined,
            loginMethod: "google",
            role: "user",
            isActive: true,
            mustChangePassword: false,
            totpEnabled: false,
            lastSignedIn: new Date(),
          });
          const [created] = await conn
            .select()
            .from(users)
            .where(eq(users.openId, openId))
            .limit(1);
          if (!created) {
            return res.redirect("/login?error=user_creation_failed");
          }
          user = created;
        }

        // Issue session JWT
        const token = await signSessionJwt({
          userId: user.id,
          openId: user.openId,
          role: user.role,
          name: user.name ?? null,
        });

        const cookieOpts = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, token, cookieOpts);

        // Audit log (non-fatal)
        writeAuditLog({
          actorId: user.id,
          actorName: user.name ?? user.email ?? undefined,
          action: "user.login",
          targetType: "user",
          targetId: user.id,
          targetName: user.email ?? undefined,
          metadata: { method: "google", googleId },
          ipAddress: req.ip,
        }).catch(() => {});

        // Decode returnTo from state
        let returnTo = "/";
        try {
          const raw = req.query.state as string;
          if (raw) {
            const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
            if (parsed.returnTo && typeof parsed.returnTo === "string") {
              // Only allow relative paths to prevent open-redirect
              const rt = parsed.returnTo;
              if (rt.startsWith("/") && !rt.startsWith("//")) returnTo = rt;
            }
          }
        } catch {
          // ignore
        }

        return res.redirect(returnTo);
      } catch (err) {
        console.error("[GoogleOAuth] Callback error:", err);
        return res.redirect("/login?error=google_callback_error");
      }
    }
  );
}
