import { and, desc, eq, inArray, like, or, sql, asc } from "drizzle-orm";
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
export async function getVideos(opts?: {
  search?: string;
  status?: string;
  channelId?: number;
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "title" | "publishStatus";
  sortDir?: "asc" | "desc";
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const page = opts?.page ?? 1;
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (opts?.search) {
    conditions.push(
      or(
        like(videos.title, `%${opts.search}%`),
        like(videos.slug, `%${opts.search}%`),
        like(videos.description, `%${opts.search}%`)
      ) as any
    );
  }
  if (opts?.status) {
    conditions.push(eq(videos.publishStatus, opts.status as any));
  }
  // Server-side tag filtering: each tag must appear in the JSON tags array
  if (opts?.tags && opts.tags.length > 0) {
    for (const tag of opts.tags) {
      // MySQL JSON_SEARCH for case-insensitive tag match
      conditions.push(
        sql`JSON_SEARCH(LOWER(${videos.tags}), 'one', LOWER(${tag})) IS NOT NULL` as any
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Determine sort order
  const sortDir = opts?.sortDir ?? "desc";
  let orderExpr;
  switch (opts?.sortBy) {
    case "title":
      orderExpr = sortDir === "asc" ? asc(videos.title) : desc(videos.title);
      break;
    case "publishStatus":
      orderExpr = sortDir === "asc" ? asc(videos.publishStatus) : desc(videos.publishStatus);
      break;
    default:
      orderExpr = sortDir === "asc" ? asc(videos.createdAt) : desc(videos.createdAt);
  }

  const [items, countResult] = await Promise.all([
    whereClause
      ? db.select().from(videos).where(whereClause).orderBy(orderExpr).limit(limit).offset(offset)
      : db.select().from(videos).orderBy(orderExpr).limit(limit).offset(offset),
    whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(videos).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(videos),
  ]);

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

// ─── Tags ─────────────────────────────────────────────────────────────────────
/** Return all distinct non-empty tags across all videos (tags stored as JSON array). */
export async function getAllDistinctTags(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ tags: videos.tags }).from(videos);
  const tagSet = new Set<string>();
  for (const row of rows) {
    const t = row.tags;
    if (Array.isArray(t)) {
      for (const tag of t as string[]) {
        if (typeof tag === "string" && tag.trim()) tagSet.add(tag.trim().toLowerCase());
      }
    }
  }
  return Array.from(tagSet).sort();
}

// ─── Channel Statistics ───────────────────────────────────────────────────────
/**
 * Returns detailed statistics for a single channel, used by the Channel Detail
 * statistics panel.
 */
export async function getChannelStats(channelId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();

  const [
    videoStatusRows,
    validationRows,
    scheduleRows,
    categoryRows,
    channelRow,
  ] = await Promise.all([
    // Video counts by publish status
    db
      .select({ count: sql<number>`count(*)`, status: videos.publishStatus })
      .from(channelVideos)
      .innerJoin(videos, eq(channelVideos.videoId, videos.id))
      .where(eq(channelVideos.channelId, channelId))
      .groupBy(videos.publishStatus),

    // Validation status counts
    db
      .select({ count: sql<number>`count(*)`, status: videos.validationStatus })
      .from(channelVideos)
      .innerJoin(videos, eq(channelVideos.videoId, videos.id))
      .where(eq(channelVideos.channelId, channelId))
      .groupBy(videos.validationStatus),

    // Schedule windows
    db
      .select({
        publishFrom: channelVideos.publishFrom,
        publishTo: channelVideos.publishTo,
      })
      .from(channelVideos)
      .where(eq(channelVideos.channelId, channelId)),

    // Content rows (categories)
    db
      .select({ count: sql<number>`count(*)` })
      .from(channelCategories)
      .where(eq(channelCategories.channelId, channelId)),

    // Channel itself (for last updated)
    db
      .select({ updatedAt: channels.updatedAt, createdAt: channels.createdAt, status: channels.status })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1),
  ]);

  const totalVideos = videoStatusRows.reduce((s, r) => s + Number(r.count), 0);
  const publishedVideos = Number(videoStatusRows.find((r) => r.status === "published")?.count ?? 0);
  const draftVideos = Number(videoStatusRows.find((r) => r.status === "draft")?.count ?? 0);
  const pendingVideos = Number(videoStatusRows.find((r) => r.status === "pending")?.count ?? 0);
  const approvedVideos = Number(videoStatusRows.find((r) => r.status === "approved")?.count ?? 0);
  const archivedVideos = Number(videoStatusRows.find((r) => r.status === "archived")?.count ?? 0);

  const validVideos = Number(validationRows.find((r) => r.status === "valid")?.count ?? 0);
  const invalidVideos = Number(validationRows.find((r) => r.status === "error")?.count ?? 0);
  const warningVideos = Number(validationRows.find((r) => r.status === "warning")?.count ?? 0);
  const uncheckedVideos = Number(validationRows.find((r) => r.status === "unchecked")?.count ?? 0);

  // Schedule analysis
  let activeSchedules = 0;
  let scheduledFuture = 0;
  let expiredSchedules = 0;
  let alwaysOn = 0;

  for (const row of scheduleRows) {
    const from = row.publishFrom;
    const to = row.publishTo;
    if (!from && !to) {
      alwaysOn++;
    } else if (to && now > to) {
      expiredSchedules++;
    } else if (from && now < from) {
      scheduledFuture++;
    } else {
      activeSchedules++;
    }
  }

  const totalContentRows = Number(categoryRows[0]?.count ?? 0);
  const channelInfo = channelRow[0] ?? null;

  return {
    totalVideos,
    publishedVideos,
    draftVideos,
    pendingVideos,
    approvedVideos,
    archivedVideos,
    validVideos,
    invalidVideos,
    warningVideos,
    uncheckedVideos,
    activeSchedules,
    scheduledFuture,
    expiredSchedules,
    alwaysOn,
    totalContentRows,
    channelStatus: channelInfo?.status ?? null,
    channelUpdatedAt: channelInfo?.updatedAt ?? null,
    channelCreatedAt: channelInfo?.createdAt ?? null,
  };
}
