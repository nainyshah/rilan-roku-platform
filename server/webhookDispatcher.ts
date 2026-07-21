/**
 * Webhook Dispatcher
 *
 * Fires HTTP POST requests to registered webhook endpoints whenever a Roku
 * channel feed changes.  Each delivery is signed with HMAC-SHA256 so the
 * receiver can verify authenticity.
 *
 * Retry strategy: up to 3 attempts with exponential back-off (1s, 2s, 4s).
 * Every attempt (success or failure) is written to the webhook_deliveries table.
 */

import crypto from "crypto";
import { getDb } from "./db.js";
import { webhookConfigs, webhookDeliveries } from "../drizzle/schema.js";
import { and, eq } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | "feed.updated"
  | "feed.invalidated"
  | "channel.published"
  | "channel.unpublished"
  | "video.published"
  | "video.archived"
  | "test.ping";

export interface WebhookPayload {
  event: WebhookEvent;
  channelSlug: string;
  channelId: number;
  timestamp: string; // ISO 8601
  feedUrl: string;
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  webhookId: number;
  event: WebhookEvent;
  success: boolean;
  statusCode: number | null;
  responseBody: string | null;
  attempt: number;
  durationMs: number;
  error?: string;
}

// ── HMAC Signature ─────────────────────────────────────────────────────────

/**
 * Generate an HMAC-SHA256 signature for the payload body.
 * Header sent: X-Roku-Signature: sha256=<hex>
 */
export function signPayload(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verify an incoming webhook signature (for testing/debugging).
 */
export function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = signPayload(body, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Single Delivery Attempt ────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS = 10_000; // 10 seconds per attempt

async function attemptDelivery(
  url: string,
  body: string,
  secret: string,
  attempt: number
): Promise<{ statusCode: number; responseBody: string; durationMs: number }> {
  const signature = signPayload(body, secret);
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Roku-Signature": signature,
        "X-Roku-Event": JSON.parse(body).event ?? "unknown",
        "X-Webhook-Attempt": String(attempt),
        "User-Agent": "SennaVision-Roku-Platform/1.0",
      },
      body,
      signal: controller.signal,
    });

    const responseBody = await response.text().catch(() => "");
    return {
      statusCode: response.status,
      responseBody: responseBody.slice(0, 500), // truncate to 500 chars
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Retry Loop ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000]; // exponential back-off

async function deliverWithRetry(
  webhookId: number,
  url: string,
  body: string,
  secret: string,
  event: WebhookEvent
): Promise<DeliveryResult> {
  let lastResult: DeliveryResult | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 2] ?? 4000));
    }

    try {
      const { statusCode, responseBody, durationMs } = await attemptDelivery(
        url,
        body,
        secret,
        attempt
      );
      const success = statusCode >= 200 && statusCode < 300;

      lastResult = {
        webhookId,
        event,
        success,
        statusCode,
        responseBody,
        attempt,
        durationMs,
      };

      // Log every attempt to DB
      await logDelivery(lastResult);

      if (success) {
        console.log(
          `[Webhook] Delivered webhookId=${webhookId} event=${event} status=${statusCode} attempt=${attempt}`
        );
        return lastResult;
      }

      console.warn(
        `[Webhook] Attempt ${attempt}/${MAX_ATTEMPTS} failed webhookId=${webhookId} status=${statusCode}`
      );
    } catch (err) {
      const error = (err as Error).message;
      lastResult = {
        webhookId,
        event,
        success: false,
        statusCode: null,
        responseBody: null,
        attempt,
        durationMs: 0,
        error,
      };

      await logDelivery(lastResult);

      console.warn(
        `[Webhook] Attempt ${attempt}/${MAX_ATTEMPTS} error webhookId=${webhookId}: ${error}`
      );
    }
  }

  return lastResult!;
}

// ── DB Logging ─────────────────────────────────────────────────────────────

async function logDelivery(result: DeliveryResult): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(webhookDeliveries).values({
      webhookId: result.webhookId,
      event: result.event,
      statusCode: result.statusCode,
      responseBody: result.responseBody ?? result.error ?? null,
      attempt: result.attempt,
      success: result.success,
    });
  } catch (err) {
    console.error("[Webhook] Failed to log delivery:", (err as Error).message);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fire webhooks for all active configs registered for a channel.
 * Runs all deliveries in parallel (non-blocking from caller's perspective).
 */
export async function dispatchWebhooks(
  channelId: number,
  channelSlug: string,
  event: WebhookEvent,
  data?: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const configs = await db
      .select()
      .from(webhookConfigs)
      .where(and(eq(webhookConfigs.channelId, channelId), eq(webhookConfigs.active, true)));

    if (configs.length === 0) return;

    const payload: WebhookPayload = {
      event,
      channelSlug,
      channelId,
      timestamp: new Date().toISOString(),
      feedUrl: `/api/roku/feed/${channelSlug}.json`,
      data,
    };
    const body = JSON.stringify(payload);

    // Filter configs that subscribe to this event
    const matching = configs.filter((cfg) => {
      if (!cfg.events) return true; // no filter = all events
      try {
        const eventsRaw = typeof cfg.events === "string" ? cfg.events : JSON.stringify(cfg.events);
        const events = JSON.parse(eventsRaw) as string[];
        return events.includes(event) || events.includes("*");
      } catch {
        return true;
      }
    });

    // Fire all in parallel (fire-and-forget from the HTTP request perspective)
    await Promise.allSettled(
      matching.map((cfg) =>
        deliverWithRetry(cfg.id, cfg.url, body, cfg.secret ?? "", event)
      )
    );
  } catch (err) {
    console.error("[Webhook] dispatchWebhooks error:", (err as Error).message);
  }
}

/**
 * Send a test ping to a single webhook config.
 * Returns the delivery result directly (does not retry on failure).
 */
export async function testWebhook(
  webhookId: number,
  url: string,
  secret: string,
  channelSlug: string,
  channelId: number
): Promise<DeliveryResult> {
  const payload: WebhookPayload = {
    event: "test.ping",
    channelSlug,
    channelId,
    timestamp: new Date().toISOString(),
    feedUrl: `/api/roku/feed/${channelSlug}.json`,
    data: { message: "This is a test ping from SennaVision Roku Platform" },
  };
  const body = JSON.stringify(payload);

  try {
    const { statusCode, responseBody, durationMs } = await attemptDelivery(
      url,
      body,
      secret,
      1
    );
    const result: DeliveryResult = {
      webhookId,
      event: "test.ping",
      success: statusCode >= 200 && statusCode < 300,
      statusCode,
      responseBody,
      attempt: 1,
      durationMs,
    };
    await logDelivery(result);
    return result;
  } catch (err) {
    const result: DeliveryResult = {
      webhookId,
      event: "test.ping",
      success: false,
      statusCode: null,
      responseBody: null,
      attempt: 1,
      durationMs: 0,
      error: (err as Error).message,
    };
    await logDelivery(result);
    return result;
  }
}
