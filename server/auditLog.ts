/**
 * server/auditLog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight helpers for writing and reading the admin_audit_log table.
 *
 * Usage in tRPC procedures:
 *
 *   import { writeAuditLog, listAuditLog } from "../auditLog";
 *
 *   await writeAuditLog({
 *     actorId:    ctx.user.id,
 *     actorName:  ctx.user.name ?? ctx.user.email,
 *     action:     "user.update",
 *     targetType: "user",
 *     targetId:   input.userId,
 *     targetName: updatedUser.email,
 *     metadata:   { before: { role: oldRole }, after: { role: input.role } },
 *     ipAddress:  ctx.req.ip,
 *   });
 */

import { desc, eq, and, gte } from "drizzle-orm";
import { adminAuditLog, type InsertAdminAuditLog } from "../drizzle/schema";
import { getDb } from "./db";

// ─── Write ────────────────────────────────────────────────────────────────────

export type AuditEntry = Omit<InsertAdminAuditLog, "id" | "createdAt">;

/**
 * Appends a single audit-log entry. Failures are swallowed and logged to
 * stderr so that a logging error never breaks the primary operation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(adminAuditLog).values(entry);
  } catch (err) {
    console.error("[AuditLog] Failed to write entry:", err);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export type AuditLogFilter = {
  /** Only return entries for a specific actor */
  actorId?: number;
  /** Only return entries for a specific target */
  targetId?: number;
  /** Only return entries of a specific action, e.g. "user.delete" */
  action?: string;
  /** Only return entries on or after this date */
  since?: Date;
  /** Maximum number of rows to return (default: 100, max: 500) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
};

export async function listAuditLog(filter: AuditLogFilter = {}) {
  const db = await getDb();
  if (!db) return { entries: [], total: 0 };

  const { actorId, targetId, action, since, limit = 100, offset = 0 } = filter;
  const safeLimit = Math.min(limit, 500);

  const conditions = [];
  if (actorId !== undefined) conditions.push(eq(adminAuditLog.actorId, actorId));
  if (targetId !== undefined) conditions.push(eq(adminAuditLog.targetId, targetId));
  if (action !== undefined) conditions.push(eq(adminAuditLog.action, action));
  if (since !== undefined) conditions.push(gte(adminAuditLog.createdAt, since));

  const query = db
    .select()
    .from(adminAuditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(safeLimit)
    .offset(offset);

  const entries = await query;
  return { entries };
}
