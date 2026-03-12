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
