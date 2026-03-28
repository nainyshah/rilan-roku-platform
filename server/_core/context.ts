import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, verifySessionJwt } from "../auth/helpers";
import { getUserByOpenId } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Build the tRPC request context using the custom JWT session.
 *
 * Flow:
 *  1. Parse the `app_session_id` cookie from the incoming request.
 *  2. Verify and decode the JWT using the local JWT_SECRET (no external call).
 *  3. Look up the user row in the local database by openId.
 *  4. Return the user (or null for unauthenticated / invalid session).
 *
 * This replaces the previous `sdk.authenticateRequest()` which called the
 * Manus OAuth server on every request.
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // 1. Extract session cookie
    const rawCookies = opts.req.headers.cookie ?? "";
    const cookieMap = new Map(
      rawCookies
        .split(";")
        .map((c) => c.trim().split("=").map(decodeURIComponent) as [string, string])
    );
    const sessionToken = cookieMap.get(COOKIE_NAME);

    // 2. Verify JWT locally — no network call, no Manus SDK
    const payload = await verifySessionJwt(sessionToken);
    if (!payload) {
      return { req: opts.req, res: opts.res, user: null };
    }

    // 3. Load the user from the local database
    const dbUser = await getUserByOpenId(payload.openId);
    if (!dbUser) {
      // Token was valid but user no longer exists in DB (deleted / deactivated)
      return { req: opts.req, res: opts.res, user: null };
    }

    // 4. Reject deactivated accounts
    if (dbUser.isActive === false) {
      return { req: opts.req, res: opts.res, user: null };
    }

    user = dbUser;
  } catch {
    // Any unexpected error → treat as unauthenticated (public procedures still work)
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
