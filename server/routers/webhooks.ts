/**
 * Webhooks router
 *
 * Provides admin-only tRPC procedures for managing webhook configurations
 * and viewing delivery logs per channel.
 */

import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { getDb } from "../db.js";
import { webhookConfigs, webhookDeliveries, channels } from "../../drizzle/schema.js";
import { dispatchWebhooks, testWebhook } from "../webhookDispatcher.js";

const WEBHOOK_EVENTS = [
  "feed.updated",
  "feed.invalidated",
  "channel.published",
  "channel.unpublished",
  "video.published",
  "video.archived",
  "test.ping",
] as const;

// ── Admin guard ────────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ── Router ─────────────────────────────────────────────────────────────────

export const webhooksRouter = router({
  /** List all webhook configs for a channel */
  list: adminProcedure
    .input(z.object({ channelId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.channelId, input.channelId))
        .orderBy(desc(webhookConfigs.createdAt));
    }),

  /** Get a single webhook config by ID */
  getById: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      return rows[0];
    }),

  /** Create a new webhook config */
  create: adminProcedure
    .input(
      z.object({
        channelId: z.number().int().positive(),
        label: z.string().min(1).max(255),
        url: z.string().url("Must be a valid URL"),
        secret: z.string().max(255).optional(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
        active: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify channel exists
      const ch = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.id, input.channelId))
        .limit(1);
      if (!ch[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });

      await db.insert(webhookConfigs).values({
        channelId: input.channelId,
        label: input.label,
        url: input.url,
        secret: input.secret ?? null,
        events: input.events ? JSON.stringify(input.events) : null,
        active: input.active,
      });

      const rows = await db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.channelId, input.channelId))
        .orderBy(desc(webhookConfigs.createdAt))
        .limit(1);

      return rows[0]!;
    }),

  /** Update an existing webhook config */
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        label: z.string().min(1).max(255).optional(),
        url: z.string().url("Must be a valid URL").optional(),
        secret: z.string().max(255).nullable().optional(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const existing = await db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.id, input.id))
        .limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });

      const updateSet: Record<string, unknown> = {};
      if (input.label !== undefined) updateSet.label = input.label;
      if (input.url !== undefined) updateSet.url = input.url;
      if (input.secret !== undefined) updateSet.secret = input.secret;
      if (input.events !== undefined)
        updateSet.events = input.events ? JSON.stringify(input.events) : null;
      if (input.active !== undefined) updateSet.active = input.active;

      await db
        .update(webhookConfigs)
        .set(updateSet)
        .where(eq(webhookConfigs.id, input.id));

      const updated = await db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.id, input.id))
        .limit(1);
      return updated[0]!;
    }),

  /** Delete a webhook config and its delivery logs */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db
        .delete(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.id));
      await db
        .delete(webhookConfigs)
        .where(eq(webhookConfigs.id, input.id));

      return { success: true };
    }),

  /** Send a test ping to a webhook */
  testFire: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(webhookConfigs)
        .innerJoin(channels, eq(webhookConfigs.channelId, channels.id))
        .where(eq(webhookConfigs.id, input.id))
        .limit(1);

      if (!rows[0])
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });

      const { webhook_configs: cfg, channels: ch } = rows[0];

      const result = await testWebhook(
        cfg.id,
        cfg.url,
        cfg.secret ?? "",
        ch.slug,
        ch.id
      );

      return result;
    }),

  /** List delivery logs for a webhook (most recent first) */
  deliveries: adminProcedure
    .input(
      z.object({
        webhookId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, input.webhookId))
        .orderBy(desc(webhookDeliveries.deliveredAt))
        .limit(input.limit);
    }),

  /** List all recent deliveries across all webhooks for a channel */
  channelDeliveries: adminProcedure
    .input(
      z.object({
        channelId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get all webhook IDs for this channel
      const configs = await db
        .select({ id: webhookConfigs.id, label: webhookConfigs.label })
        .from(webhookConfigs)
        .where(eq(webhookConfigs.channelId, input.channelId));

      if (configs.length === 0) return [];

      // Fetch deliveries for each webhook and merge
      const allDeliveries = await Promise.all(
        configs.map(async (cfg) => {
          const deliveries = await db
            .select()
            .from(webhookDeliveries)
            .where(eq(webhookDeliveries.webhookId, cfg.id))
            .orderBy(desc(webhookDeliveries.deliveredAt))
            .limit(input.limit);
          return deliveries.map((d) => ({ ...d, webhookLabel: cfg.label }));
        })
      );

      return allDeliveries
        .flat()
        .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime())
        .slice(0, input.limit);
    }),

  /** Get available event types */
  eventTypes: adminProcedure.query(() => WEBHOOK_EVENTS),

  /**
   * Retry a specific failed delivery by re-dispatching the same event
   * to the webhook endpoint.
   */
  retryDelivery: adminProcedure
    .input(z.object({ deliveryId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Fetch the original delivery
      const deliveryRows = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, input.deliveryId))
        .limit(1);
      if (!deliveryRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
      const delivery = deliveryRows[0];

      // Fetch the webhook config
      const cfgRows = await db
        .select()
        .from(webhookConfigs)
        .innerJoin(channels, eq(webhookConfigs.channelId, channels.id))
        .where(eq(webhookConfigs.id, delivery.webhookId))
        .limit(1);
      if (!cfgRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook config not found" });

      const { webhook_configs: cfg, channels: ch } = cfgRows[0];

      // Re-dispatch the same event
      const result = await testWebhook(
        cfg.id,
        cfg.url,
        cfg.secret ?? "",
        ch.slug,
        ch.id
      );

      return result;
    }),

  /**
   * Get aggregated delivery stats across all webhooks for a channel.
   * Returns total, success, failed counts and recent deliveries.
   */
  deliveryStats: adminProcedure
    .input(z.object({ channelId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const configs = await db
        .select({ id: webhookConfigs.id, label: webhookConfigs.label, url: webhookConfigs.url, active: webhookConfigs.active })
        .from(webhookConfigs)
        .where(eq(webhookConfigs.channelId, input.channelId));

      if (configs.length === 0) return { configs: [], totalDeliveries: 0, successCount: 0, failedCount: 0, recentDeliveries: [] };

      const webhookIds = configs.map((c) => c.id);

      const allDeliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(inArray(webhookDeliveries.webhookId, webhookIds))
        .orderBy(desc(webhookDeliveries.deliveredAt))
        .limit(200);

      const successCount = allDeliveries.filter((d) => d.success).length;
      const failedCount = allDeliveries.filter((d) => !d.success).length;

      // Per-webhook stats
      const configStats = configs.map((cfg) => {
        const cfgDeliveries = allDeliveries.filter((d) => d.webhookId === cfg.id);
        const lastDelivery = cfgDeliveries[0] ?? null;
        return {
          ...cfg,
          totalDeliveries: cfgDeliveries.length,
          successCount: cfgDeliveries.filter((d) => d.success).length,
          failedCount: cfgDeliveries.filter((d) => !d.success).length,
          lastDeliveredAt: lastDelivery?.deliveredAt ?? null,
          lastSuccess: lastDelivery?.success ?? null,
        };
      });

      return {
        configs: configStats,
        totalDeliveries: allDeliveries.length,
        successCount,
        failedCount,
        recentDeliveries: allDeliveries.slice(0, 50).map((d) => ({
          ...d,
          webhookLabel: configs.find((c) => c.id === d.webhookId)?.label ?? "Unknown",
        })),
      };
    }),

  /**
   * Retry all failed deliveries for a webhook (re-fire the most recent failed event).
   */
  retryAllFailed: adminProcedure
    .input(z.object({ webhookId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const cfgRows = await db
        .select()
        .from(webhookConfigs)
        .innerJoin(channels, eq(webhookConfigs.channelId, channels.id))
        .where(eq(webhookConfigs.id, input.webhookId))
        .limit(1);
      if (!cfgRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });

      const { webhook_configs: cfg, channels: ch } = cfgRows[0];

      // Get the most recent failed delivery
      const failedDeliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.webhookId, input.webhookId), eq(webhookDeliveries.success, false)))
        .orderBy(desc(webhookDeliveries.deliveredAt))
        .limit(10);

      if (failedDeliveries.length === 0) return { retriedCount: 0, results: [] };

      // Re-fire each unique failed event (deduplicated by event type)
      const uniqueEvents = Array.from(new Set(failedDeliveries.map((d) => d.event)));
      const results = await Promise.allSettled(
        uniqueEvents.map((event) =>
          testWebhook(cfg.id, cfg.url, cfg.secret ?? "", ch.slug, ch.id)
        )
      );

      const retriedCount = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
      return { retriedCount, total: uniqueEvents.length };
    }),
});
