/**
 * server/auth/seed-admin.ts
 *
 * Seeds the initial admin user if no admin exists yet.
 * Called automatically on server startup (see server/_core/index.ts).
 *
 * On first boot a cryptographically random 16-character password is generated
 * and printed ONCE to the server console inside a clearly visible banner.
 * The account is flagged mustChangePassword=true so the admin is forced to
 * set a new password immediately after first login.
 *
 * Override via environment variables:
 *   ADMIN_SEED_EMAIL    — default: admin@rilan.com
 *   ADMIN_SEED_NAME     — default: Platform Admin
 *   ADMIN_SEED_PASSWORD — if set (≥6 chars), uses this instead of a random one
 *                         Example: ADMIN_SEED_PASSWORD=Admin@2024!
 *
 * IMPORTANT: After first login, navigate to /change-password immediately
 * to set a secure password and dismiss the expiry banner.
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { hashPassword, PASSWORD_MIN_LENGTH } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? "admin@rilan.com";
const ADMIN_NAME  = process.env.ADMIN_SEED_NAME  ?? "Platform Admin";

/** Generate a random 16-character alphanumeric + symbol password. */
function generateRandomPassword(): string {
  // Exclude visually ambiguous characters (0/O, 1/l/I)
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(16);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function seedAdminUser(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Auth] Database not available — skipping admin seed.");
      return;
    }

    // Skip if any admin already exists.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (existing) {
      console.log("[Auth] Admin user already exists — skipping seed.");
      return;
    }

    // Use env-provided password if valid, otherwise generate a random one.
    const envPassword = process.env.ADMIN_SEED_PASSWORD;
    const plainPassword =
      envPassword && envPassword.length >= PASSWORD_MIN_LENGTH
        ? envPassword
        : generateRandomPassword();

    const passwordHash = await hashPassword(plainPassword);
    const openId = `local_admin_${Date.now()}`;

    await db.insert(users).values({
      openId,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      loginMethod: "password",
      passwordHash,
      // null passwordChangedAt → isPasswordExpired() returns true → expiry banner shown
      passwordChangedAt: null,
      mustChangePassword: true, // forces redirect to /change-password after login
      isActive: true,
      totpEnabled: false,
      lastSignedIn: new Date(),
    });

    // ── Print credentials ONCE — this is the only time the password is visible ──
    const LINE = "═".repeat(58);
    console.log("");
    console.log(`╔${LINE}╗`);
    console.log(`║${"  RILAN PLATFORM — FIRST-BOOT ADMIN ACCOUNT".padEnd(58)}║`);
    console.log(`╠${LINE}╣`);
    console.log(`║  Email    : ${ADMIN_EMAIL.padEnd(46)}║`);
    console.log(`║  Password : ${plainPassword.padEnd(46)}║`);
    console.log(`╠${LINE}╣`);
    console.log(`║  ⚠  Change this password immediately after first login.  ║`);
    console.log(`║  This message will NOT appear again.                     ║`);
    console.log(`╚${LINE}╝`);
    console.log("");
  } catch (err) {
    console.error("[Auth] Failed to seed admin user:", err);
  }
}
