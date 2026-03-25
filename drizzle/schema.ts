import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "content_manager", "publishing_manager"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Channels ─────────────────────────────────────────────────────────────────
export const channels = mysqlTable("channels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "inactive", "draft"]).default("draft").notNull(),
  themeJson: json("themeJson"),
  brandingJson: json("brandingJson"),
  featureFlagsJson: json("featureFlagsJson"),
  adSettingsJson: json("adSettingsJson"),
  feedPath: varchar("feedPath", { length: 500 }),
  language: varchar("language", { length: 10 }).default("en"),
  contentRating: varchar("contentRating", { length: 50 }).default("all"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = typeof channels.$inferInsert;

// ─── Videos ───────────────────────────────────────────────────────────────────
export const videos = mysqlTable("videos", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull().unique(),
  description: text("description"),
  thumbnailUrl: text("thumbnailUrl"),
  streamUrl: text("streamUrl"),
  durationSeconds: int("durationSeconds"),
  language: varchar("language", { length: 10 }).default("en"),
  contentType: mysqlEnum("contentType", ["movie", "series", "episode", "short", "clip", "special"]).default("clip"),
  contentRating: varchar("contentRating", { length: 50 }).default("all"),
  releaseDate: varchar("releaseDate", { length: 20 }),
  rightsOwner: varchar("rightsOwner", { length: 255 }),
  publishStatus: mysqlEnum("publishStatus", ["draft", "pending", "approved", "published", "archived"]).default("draft").notNull(),
  validationStatus: mysqlEnum("validationStatus", ["valid", "warning", "error", "unchecked"]).default("unchecked"),
  validationErrors: json("validationErrors"),
  tags: json("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

// ─── Video ↔ Category (many-to-many) ─────────────────────────────────────────
export const videoCategories = mysqlTable("video_categories", {
  id: int("id").autoincrement().primaryKey(),
  videoId: int("videoId").notNull(),
  categoryId: int("categoryId").notNull(),
});

export type VideoCategory = typeof videoCategories.$inferSelect;

// ─── Channel ↔ Video assignments ─────────────────────────────────────────────
export const channelVideos = mysqlTable("channel_videos", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  videoId: int("videoId").notNull(),
  featuredFlag: boolean("featuredFlag").default(false),
  sortOrder: int("sortOrder").default(0),
  publishFrom: timestamp("publishFrom"),
  publishTo: timestamp("publishTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChannelVideo = typeof channelVideos.$inferSelect;

// ─── Channel ↔ Category rows ──────────────────────────────────────────────────
export const channelCategories = mysqlTable("channel_categories", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  categoryId: int("categoryId").notNull(),
  rowTitle: varchar("rowTitle", { length: 255 }),
  rowOrder: int("rowOrder").default(0),
  isVisible: boolean("isVisible").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChannelCategory = typeof channelCategories.$inferSelect;

// ─── Branding Assets ──────────────────────────────────────────────────────────
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(),
  assetType: mysqlEnum("assetType", [
    "logo",
    "splash",
    "hd_icon",
    "fhd_icon",
    "screenshot",
    "hero_banner",
    "background",
  ]).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey"),
  fileName: varchar("fileName", { length: 500 }),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSizeBytes: int("fileSizeBytes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

// ─── Import Logs ──────────────────────────────────────────────────────────────
export const importLogs = mysqlTable("import_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** Original filename uploaded by the user */
  filename: varchar("filename", { length: 500 }).notNull(),
  /** S3 key for the stored original CSV file */
  csvS3Key: text("csvS3Key"),
  /** Public/presigned URL to download the original CSV */
  csvUrl: text("csvUrl"),
  /** Summary counts */
  totalRows: int("totalRows").notNull().default(0),
  importedCount: int("importedCount").notNull().default(0),
  skippedCount: int("skippedCount").notNull().default(0),
  duplicateCount: int("duplicateCount").notNull().default(0),
  errorCount: int("errorCount").notNull().default(0),
  /** Full per-row results JSON array */
  resultsJson: json("resultsJson"),
  /** Default channel slug used during this import (if any) */
  defaultChannelSlug: varchar("defaultChannelSlug", { length: 255 }),
  /** Default category slug used during this import (if any) */
  defaultCategorySlug: varchar("defaultCategorySlug", { length: 255 }),
  /** User who triggered the import */
  importedBy: int("importedBy"),
  importedByName: varchar("importedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportLog = typeof importLogs.$inferSelect;
export type InsertImportLog = typeof importLogs.$inferInsert;

// ─── Webhook Configs ──────────────────────────────────────────────────────────
export const webhookConfigs = mysqlTable("webhook_configs", {
  id: int("id").autoincrement().primaryKey(),
  /** Channel this webhook is scoped to */
  channelId: int("channelId").notNull(),
  /** Human-readable label for this webhook */
  label: varchar("label", { length: 255 }).notNull(),
  /** Target URL to POST to */
  url: text("url").notNull(),
  /** HMAC-SHA256 signing secret (stored in plain text — rotate regularly) */
  secret: varchar("secret", { length: 255 }),
  /** JSON array of event names to subscribe to, e.g. ["feed.updated","video.published"] */
  events: json("events"),
  /** Whether this webhook is currently active */
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertWebhookConfig = typeof webhookConfigs.$inferInsert;

// ─── Webhook Deliveries ───────────────────────────────────────────────────────
export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  webhookId: int("webhookId").notNull(),
  event: varchar("event", { length: 100 }).notNull(),
  statusCode: int("statusCode"),
  responseBody: text("responseBody"),
  attempt: int("attempt").notNull().default(1),
  success: boolean("success").notNull().default(false),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// ─── AI Jobs ──────────────────────────────────────────────────────────────────
export const aiJobs = mysqlTable("ai_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** The type of AI operation */
  jobType: mysqlEnum("jobType", [
    "enrich_video",
    "bulk_enrich",
    "generate_tags",
    "validate_content",
    "generate_description",
    "generate_title",
  ]).notNull(),
  /** Status of the job */
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  /** Optional reference to a single video */
  videoId: int("videoId"),
  /** Optional reference to a channel (for bulk operations) */
  channelId: int("channelId"),
  /** Input payload sent to the LLM */
  inputPayload: json("inputPayload"),
  /** Raw LLM output */
  outputPayload: json("outputPayload"),
  /** Human-readable result summary */
  resultSummary: text("resultSummary"),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** Number of videos processed (for bulk jobs) */
  processedCount: int("processedCount").default(0),
  /** Number of videos that failed (for bulk jobs) */
  failedCount: int("failedCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type AiJob = typeof aiJobs.$inferSelect;
export type InsertAiJob = typeof aiJobs.$inferInsert;
