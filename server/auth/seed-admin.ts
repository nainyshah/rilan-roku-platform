/**
 * server/auth/seed-admin.ts
 *
 * Seeds the initial admin user if no admin exists yet.
 * Called automatically on server startup (see server/index.ts).
 *
 * Default credentials (change immediately after first login):
 *   Email:    admin@rilan.local
 *   Password: Admin@2024!
 */

import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? "admin@rilan.local";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "Admin@2024!";
const ADMIN_NAME = process.env.ADMIN_SEED_NAME ?? "Platform Admin";

export async function seedAdminUser(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Auth] Database not available — skipping admin seed.");
      return;
    }

    // Check if any admin already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (existing) {
      console.log("[Auth] Admin user already exists — skipping seed.");
      return;
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const openId = `local_admin_${Date.now()}`;

    await db.insert(users).values({
      openId,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      loginMethod: "password",
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: true, // Force password change on first login
      isActive: true,
      totpEnabled: false,
      lastSignedIn: new Date(),
    });

    console.log(`[Auth] ✓ Admin user seeded: ${ADMIN_EMAIL}`);
    console.log(`[Auth] ⚠  Default password is "${ADMIN_PASSWORD}" — change it immediately after first login.`);
  } catch (err) {
    console.error("[Auth] Failed to seed admin user:", err);
  }
}
