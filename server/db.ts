import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  assets,
  categories,
  channelCategories,
  channelVideos,
  channels,
  users,
  videoCategories,
  videos,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Channels ─────────────────────────────────────────────────────────────────
export async function getChannels(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db
      .select()
      .from(channels)
      .where(or(like(channels.name, `%${search}%`), like(channels.slug, `%${search}%`)))
      .orderBy(desc(channels.createdAt));
  }
  return db.select().from(channels).orderBy(desc(channels.createdAt));
}

export async function getChannelById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return result[0];
}

export async function getChannelBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(channels).where(eq(channels.slug, slug)).limit(1);
  return result[0];
}

export async function createChannel(data: typeof channels.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(channels).values(data);
  return result[0];
}

export async function updateChannel(id: number, data: Partial<typeof channels.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(channels).set(data).where(eq(channels.id, id));
}

export async function updateChannelStatus(id: number, status: "active" | "inactive" | "draft") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(channels).set({ status }).where(eq(channels.id, id));
}

// ─── Videos ───────────────────────────────────────────────────────────────────
export async function getVideos(opts?: { search?: string; status?: string; channelId?: number; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = db.select().from(videos);
  const conditions = [];
  if (opts?.search) {
    conditions.push(or(like(videos.title, `%${opts.search}%`), like(videos.slug, `%${opts.search}%`)));
  }
  if (opts?.status) {
    conditions.push(eq(videos.publishStatus, opts.status as any));
  }

  let items;
  if (conditions.length > 0) {
    items = await db.select().from(videos).where(and(...conditions)).orderBy(desc(videos.createdAt)).limit(limit).offset(offset);
  } else {
    items = await db.select().from(videos).orderBy(desc(videos.createdAt)).limit(limit).offset(offset);
  }

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(videos);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getVideoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return result[0];
}
/**
 * Returns videos with their channel assignment schedule data.
 * For each video, returns the earliest publishFrom and latest publishTo across all channel assignments.
 */
export async function getVideosWithScheduleSummary(videoIds: number[]) {
  if (videoIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      videoId: channelVideos.videoId,
      publishFrom: channelVideos.publishFrom,
      publishTo: channelVideos.publishTo,
      channelId: channelVideos.channelId,
      assignmentId: channelVideos.id,
    })
    .from(channelVideos)
    .where(inArray(channelVideos.videoId, videoIds));
  // Group by videoId — a video may be in multiple channels
  const map = new Map<number, { hasSchedule: boolean; allExpired: boolean; anyLive: boolean; anyScheduled: boolean }>();
  const now = new Date();
  for (const row of rows) {
    const existing = map.get(row.videoId) ?? { hasSchedule: false, allExpired: true, anyLive: false, anyScheduled: false };
    if (row.publishFrom || row.publishTo) {
      existing.hasSchedule = true;
      const from = row.publishFrom;
      const to = row.publishTo;
      if (to && now > to) {
        // expired — allExpired stays true
      } else if (from && now < from) {
        existing.anyScheduled = true;
        existing.allExpired = false;
      } else {
        existing.anyLive = true;
        existing.allExpired = false;
      }
    } else {
      existing.allExpired = false;
    }
    map.set(row.videoId, existing);
  }
  return Array.from(map.entries()).map(([videoId, info]) => ({ videoId, ...info }));
}

export async function getVideoBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(eq(videos.slug, slug)).limit(1);
  return result[0];
}

export async function createVideo(data: typeof videos.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(videos).values(data);
}

export async function updateVideo(id: number, data: Partial<typeof videos.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(videos).set(data).where(eq(videos.id, id));
}

export async function updateVideoStatus(id: number, publishStatus: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(videos).set({ publishStatus: publishStatus as any }).where(eq(videos.id, id));
}

// ─── Categories ───────────────────────────────────────────────────────────────
export async function getCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(categories.name);
}

export async function getCategoryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result[0];
}
export async function getCategoryBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return result[0];
}

export async function createCategory(data: typeof categories.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(categories).values(data);
}

export async function updateCategory(id: number, data: Partial<typeof categories.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(categories).set(data).where(eq(categories.id, id));
}

// ─── Channel-Video assignments ─────────────────────────────────────────────────
export async function getChannelVideos(channelId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      assignment: channelVideos,
      video: videos,
    })
    .from(channelVideos)
    .innerJoin(videos, eq(channelVideos.videoId, videos.id))
    .where(eq(channelVideos.channelId, channelId))
    .orderBy(channelVideos.sortOrder);
  return rows;
}

export async function assignVideoToChannel(data: typeof channelVideos.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(channelVideos).values(data);
}

export async function removeVideoFromChannel(channelId: number, videoId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(channelVideos).where(and(eq(channelVideos.channelId, channelId), eq(channelVideos.videoId, videoId)));
}

export async function updateChannelVideoAssignment(id: number, data: Partial<typeof channelVideos.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(channelVideos).set(data).where(eq(channelVideos.id, id));
}

// ─── Channel-Category rows ─────────────────────────────────────────────────────
export async function getChannelCategories(channelId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      row: channelCategories,
      category: categories,
    })
    .from(channelCategories)
    .innerJoin(categories, eq(channelCategories.categoryId, categories.id))
    .where(eq(channelCategories.channelId, channelId))
    .orderBy(channelCategories.rowOrder);
  return rows;
}

export async function assignCategoryToChannel(data: typeof channelCategories.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(channelCategories).values(data);
}

export async function removeCategoryFromChannel(channelId: number, categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(channelCategories).where(and(eq(channelCategories.channelId, channelId), eq(channelCategories.categoryId, categoryId)));
}

export async function updateChannelCategoryRow(id: number, data: Partial<typeof channelCategories.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(channelCategories).set(data).where(eq(channelCategories.id, id));
}

// ─── Assets (Branding) ────────────────────────────────────────────────────────
export async function getAssetsByChannel(channelId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assets).where(eq(assets.channelId, channelId)).orderBy(assets.assetType);
}

export async function createAsset(data: typeof assets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(assets).values(data);
  return result;
}

export async function deleteAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(assets).where(eq(assets.id, id));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalChannels: 0, activeChannels: 0, totalVideos: 0, publishedVideos: 0, draftVideos: 0, pendingVideos: 0, validationErrors: 0 };

  const [channelStats, videoStats, validationStats] = await Promise.all([
    db.select({ count: sql<number>`count(*)`, status: channels.status }).from(channels).groupBy(channels.status),
    db.select({ count: sql<number>`count(*)`, status: videos.publishStatus }).from(videos).groupBy(videos.publishStatus),
    db.select({ count: sql<number>`count(*)` }).from(videos).where(eq(videos.validationStatus, "error")),
  ]);

  const totalChannels = channelStats.reduce((s, r) => s + Number(r.count), 0);
  const activeChannels = Number(channelStats.find((r) => r.status === "active")?.count ?? 0);
  const totalVideos = videoStats.reduce((s, r) => s + Number(r.count), 0);
  const publishedVideos = Number(videoStats.find((r) => r.status === "published")?.count ?? 0);
  const draftVideos = Number(videoStats.find((r) => r.status === "draft")?.count ?? 0);
  const pendingVideos = Number(videoStats.find((r) => r.status === "pending")?.count ?? 0);
  const validationErrors = Number(validationStats[0]?.count ?? 0);

  return { totalChannels, activeChannels, totalVideos, publishedVideos, draftVideos, pendingVideos, validationErrors };
}

// ─── Feed Generator Helpers ───────────────────────────────────────────────────
export async function getFeedData(channelSlug: string) {
  const db = await getDb();
  if (!db) return null;

  const channel = await getChannelBySlug(channelSlug);
  if (!channel) return null;

  // Get channel rows (categories) ordered
  const rows = await db
    .select({ row: channelCategories, category: categories })
    .from(channelCategories)
    .innerJoin(categories, eq(channelCategories.categoryId, categories.id))
    .where(and(eq(channelCategories.channelId, channel.id), eq(channelCategories.isVisible, true)))
    .orderBy(channelCategories.rowOrder);

  // Get all published videos assigned to this channel
  const channelVideoRows = await db
    .select({ assignment: channelVideos, video: videos })
    .from(channelVideos)
    .innerJoin(videos, eq(channelVideos.videoId, videos.id))
    .where(
      and(
        eq(channelVideos.channelId, channel.id),
        eq(videos.publishStatus, "published"),
        eq(videos.validationStatus, "valid")
      )
    )
    .orderBy(channelVideos.sortOrder);

  // Get video-category mappings for videos in this channel
  const videoIds = channelVideoRows.map((r) => r.video.id);
  let vcMappings: { videoId: number; categoryId: number }[] = [];
  if (videoIds.length > 0) {
    vcMappings = await db
      .select({ videoId: videoCategories.videoId, categoryId: videoCategories.categoryId })
      .from(videoCategories)
      .where(inArray(videoCategories.videoId, videoIds));
  }

  return { channel, rows, channelVideoRows, vcMappings };
}

export async function getVideoCategoriesForVideo(videoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoCategories).where(eq(videoCategories.videoId, videoId));
}

export async function setVideoCategories(videoId: number, categoryIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(videoCategories).where(eq(videoCategories.videoId, videoId));
  if (categoryIds.length > 0) {
    await db.insert(videoCategories).values(categoryIds.map((categoryId) => ({ videoId, categoryId })));
  }
}
