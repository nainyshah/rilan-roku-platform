import { TRPCError } from "@trpc/server";
import { importRouter } from "./routers/import";
import { z } from "zod";
import {
  assignCategoryToChannel,
  assignVideoToChannel,
  createAsset,
  createCategory,
  createChannel,
  createVideo,
  deleteAsset,
  getAssetsByChannel,
  getCategories,
  getCategoryById,
  getChannelById,
  getChannelBySlug,
  getChannelCategories,
  getChannelVideos,
  getChannels,
  getDashboardStats,
  getFeedData,
  getVideoById,
  getVideoCategoriesForVideo,
  getVideos,
  getVideosWithScheduleSummary,
  removeCategoryFromChannel,
  removeVideoFromChannel,
  setVideoCategories,
  updateCategory,
  updateChannel,
  updateChannelCategoryRow,
  updateChannelStatus,
  updateChannelVideoAssignment,
  updateVideo,
  updateVideoStatus,
  upsertUser,
} from "./db";
import { storagePut } from "./storage";
import { generateRokuFeed, generateValidationReport, validateVideo } from "./feedGenerator";
import {
  getFeedCacheStatus,
  getFeedCacheStatusForSlug,
  invalidateFeedCache,
  purgeAllFeedCache,
} from "./feedCache";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";

// ─── Role helpers ─────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "content_manager" && ctx.user.role !== "publishing_manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    stats: adminProcedure.query(async () => {
      return getDashboardStats();
    }),
  }),

  // ─── Channels ──────────────────────────────────────────────────────────────
  channels: router({
    list: adminProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return getChannels(input?.search);
      }),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const channel = await getChannelById(input.id);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
        return channel;
      }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().optional(),
          description: z.string().optional(),
          language: z.string().optional(),
          contentRating: z.string().optional(),
          status: z.enum(["active", "inactive", "draft"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const slug = input.slug || slugify(input.name);
        await createChannel({
          name: input.name,
          slug,
          description: input.description,
          language: input.language ?? "en",
          contentRating: input.contentRating ?? "all",
          status: input.status ?? "draft",
          feedPath: `/api/roku/feed/${slug}.json`,
        });
        return { slug };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          language: z.string().optional(),
          contentRating: z.string().optional(),
          themeJson: z.any().optional(),
          featureFlagsJson: z.any().optional(),
          adSettingsJson: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateChannel(id, data);
        return { success: true };
      }),

    setStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(["active", "inactive", "draft"]) }))
      .mutation(async ({ input }) => {
        await updateChannelStatus(input.id, input.status);
        return { success: true };
      }),

    // Channel videos
    getVideos: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        return getChannelVideos(input.channelId);
      }),

    assignVideo: adminProcedure
      .input(
        z.object({
          channelId: z.number(),
          videoId: z.number(),
          featuredFlag: z.boolean().optional(),
          sortOrder: z.number().optional(),
          publishFrom: z.string().optional(),
          publishTo: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await assignVideoToChannel({
          channelId: input.channelId,
          videoId: input.videoId,
          featuredFlag: input.featuredFlag ?? false,
          sortOrder: input.sortOrder ?? 0,
          publishFrom: input.publishFrom ? new Date(input.publishFrom) : undefined,
          publishTo: input.publishTo ? new Date(input.publishTo) : undefined,
        });
        return { success: true };
      }),

    removeVideo: adminProcedure
      .input(z.object({ channelId: z.number(), videoId: z.number() }))
      .mutation(async ({ input }) => {
        await removeVideoFromChannel(input.channelId, input.videoId);
        return { success: true };
      }),

    updateVideoAssignment: adminProcedure
      .input(
        z.object({
          id: z.number(),
          featuredFlag: z.boolean().optional(),
          sortOrder: z.number().optional(),
          publishFrom: z.string().nullable().optional(),
          publishTo: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateChannelVideoAssignment(id, {
          ...data,
          publishFrom: data.publishFrom ? new Date(data.publishFrom) : undefined,
          publishTo: data.publishTo ? new Date(data.publishTo) : undefined,
        });
        return { success: true };
      }),

    // Channel categories/rows
    getCategories: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        return getChannelCategories(input.channelId);
      }),

    assignCategory: adminProcedure
      .input(
        z.object({
          channelId: z.number(),
          categoryId: z.number(),
          rowTitle: z.string().optional(),
          rowOrder: z.number().optional(),
          isVisible: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await assignCategoryToChannel({
          channelId: input.channelId,
          categoryId: input.categoryId,
          rowTitle: input.rowTitle,
          rowOrder: input.rowOrder ?? 0,
          isVisible: input.isVisible ?? true,
        });
        return { success: true };
      }),

    removeCategory: adminProcedure
      .input(z.object({ channelId: z.number(), categoryId: z.number() }))
      .mutation(async ({ input }) => {
        await removeCategoryFromChannel(input.channelId, input.categoryId);
        return { success: true };
      }),

    updateCategoryRow: adminProcedure
      .input(
        z.object({
          id: z.number(),
          rowTitle: z.string().optional(),
          rowOrder: z.number().optional(),
          isVisible: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateChannelCategoryRow(id, data);
        return { success: true };
      }),

    /**
     * Set or clear the publish window (publishFrom / publishTo) on a channel_video assignment.
     * Pass null to clear either date.
     */
    setSchedule: adminProcedure
      .input(
        z.object({
          /** channel_videos.id (the assignment row id, not the video id) */
          assignmentId: z.number(),
          /** ISO-8601 datetime string or null to clear */
          publishFrom: z.string().datetime().nullable().optional(),
          /** ISO-8601 datetime string or null to clear */
          publishTo: z.string().datetime().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updateChannelVideoAssignment(input.assignmentId, {
          publishFrom: input.publishFrom === null ? null : input.publishFrom ? new Date(input.publishFrom) : undefined,
          publishTo: input.publishTo === null ? null : input.publishTo ? new Date(input.publishTo) : undefined,
        });
        return { success: true };
      }),

    /**
     * Get the current schedule for a specific channel_video assignment.
     * Returns the assignment's publishFrom and publishTo timestamps.
     */
    getSchedule: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        const rows = await getChannelVideos(input.channelId);
        return rows.map((r) => ({
          assignmentId: r.assignment.id,
          videoId: r.assignment.videoId,
          publishFrom: r.assignment.publishFrom ?? null,
          publishTo: r.assignment.publishTo ?? null,
        }));
      }),
  }),

  // ─── Videos ────────────────────────────────────────────────────────────────
  videos: router({
    list: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.string().optional(),
          page: z.number().optional(),
          limit: z.number().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return getVideos(input);
      }),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const video = await getVideoById(input.id);
        if (!video) throw new TRPCError({ code: "NOT_FOUND" });
        const categoryIds = await getVideoCategoriesForVideo(input.id);
        return { ...video, categoryIds: categoryIds.map((c) => c.categoryId) };
      }),

    create: adminProcedure
      .input(
        z.object({
          title: z.string().min(1),
          slug: z.string().optional(),
          description: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          streamUrl: z.string().optional(),
          durationSeconds: z.number().optional(),
          language: z.string().optional(),
          contentType: z.enum(["movie", "series", "episode", "short", "clip", "special"]).optional(),
          contentRating: z.string().optional(),
          releaseDate: z.string().optional(),
          rightsOwner: z.string().optional(),
          publishStatus: z.enum(["draft", "pending", "approved", "published", "archived"]).optional(),
          categoryIds: z.array(z.number()).optional(),
          tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const slug = input.slug || slugify(input.title) + "-" + Date.now();
        await createVideo({
          title: input.title,
          slug,
          description: input.description,
          thumbnailUrl: input.thumbnailUrl,
          streamUrl: input.streamUrl,
          durationSeconds: input.durationSeconds,
          language: input.language ?? "en",
          contentType: input.contentType ?? "clip",
          contentRating: input.contentRating ?? "all",
          releaseDate: input.releaseDate,
          rightsOwner: input.rightsOwner,
          publishStatus: input.publishStatus ?? "draft",
          tags: input.tags ?? [],
        });
        // Get the created video to get its ID
        const allVideos = await getVideos({ search: slug });
        const created = allVideos.items[0];
        if (created && input.categoryIds && input.categoryIds.length > 0) {
          await setVideoCategories(created.id, input.categoryIds);
        }
        return { success: true, slug };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          streamUrl: z.string().optional(),
          durationSeconds: z.number().optional(),
          language: z.string().optional(),
          contentType: z.enum(["movie", "series", "episode", "short", "clip", "special"]).optional(),
          contentRating: z.string().optional(),
          releaseDate: z.string().optional(),
          rightsOwner: z.string().optional(),
          publishStatus: z.enum(["draft", "pending", "approved", "published", "archived"]).optional(),
          categoryIds: z.array(z.number()).optional(),
          tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, categoryIds, ...data } = input;
        await updateVideo(id, data);
        if (categoryIds !== undefined) {
          await setVideoCategories(id, categoryIds);
        }
        return { success: true };
      }),

    setStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["draft", "pending", "approved", "published", "archived"]),
        })
      )
      .mutation(async ({ input }) => {
        await updateVideoStatus(input.id, input.status);
        return { success: true };
      }),

    validate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const video = await getVideoById(input.id);
        if (!video) throw new TRPCError({ code: "NOT_FOUND" });
        const result = validateVideo(video);
        await updateVideo(input.id, {
          validationStatus: result.status,
          validationErrors: result.issues,
        });
        return result;
      }),

    /**
     * Returns schedule summary for a list of video IDs.
     * Used by the Videos list page to show schedule indicators.
     */
    scheduleSummary: adminProcedure
      .input(z.object({ videoIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        return getVideosWithScheduleSummary(input.videoIds);
      }),

    /**
     * Bulk update the publishStatus of multiple videos at once.
     */
    bulkUpdateStatus: adminProcedure
      .input(
        z.object({
          ids: z.array(z.number()).min(1),
          status: z.enum(["draft", "pending", "approved", "published", "archived"]),
        })
      )
      .mutation(async ({ input }) => {
        let updatedCount = 0;
        let notFoundCount = 0;
        for (const id of input.ids) {
          const video = await getVideoById(id);
          if (!video) { notFoundCount++; continue; }
          await updateVideoStatus(id, input.status);
          updatedCount++;
        }
        return { success: true, updatedCount, notFoundCount, total: input.ids.length };
      }),
  }),

  // ─── Categories ────────────────────────────────────────────────────────────
  categories: router({
    list: adminProcedure.query(async () => {
      return getCategories();
    }),

    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const cat = await getCategoryById(input.id);
        if (!cat) throw new TRPCError({ code: "NOT_FOUND" });
        return cat;
      }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const slug = input.slug || slugify(input.name);
        await createCategory({ name: input.name, slug, description: input.description });
        return { success: true, slug };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCategory(id, data);
        return { success: true };
      }),
  }),

  // ─── Branding / Assets ─────────────────────────────────────────────────────
  branding: router({
    list: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .query(async ({ input }) => {
        return getAssetsByChannel(input.channelId);
      }),

    upload: adminProcedure
      .input(
        z.object({
          channelId: z.number(),
          assetType: z.enum(["logo", "splash", "hd_icon", "fhd_icon", "screenshot", "hero_banner", "background"]),
          fileDataBase64: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileDataBase64, "base64");
        const fileKey = `branding/${input.channelId}/${input.assetType}-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await createAsset({
          channelId: input.channelId,
          assetType: input.assetType,
          fileUrl: url,
          fileKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSizeBytes: buffer.length,
        });
        return { url, fileKey };
      }),

    delete: adminProcedure
      .input(z.object({ assetId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAsset(input.assetId);
        return { success: true };
      }),
  }),

  // ─── Import ─────────────────────────────────────────────────────────────────
  import: importRouter,
  // ─── Feed ──────────────────────────────────────────────────────────────────
  feed: router({
    preview: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .mutation(async ({ input }) => {
        const channel = await getChannelById(input.channelId);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        const data = await getFeedData(channel.slug);
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Feed data not found" });
        const { rows, channelVideoRows, vcMappings } = data;
        const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
        return { feed, channel };
      }),

    validate: adminProcedure
      .input(z.object({ channelId: z.number() }))
      .mutation(async ({ input }) => {
        const channel = await getChannelById(input.channelId);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        const data = await getFeedData(channel.slug);
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Feed data not found" });
        const { rows, channelVideoRows, vcMappings } = data;
        const report = generateValidationReport(channel, rows, channelVideoRows, vcMappings);
        return report;
      }),

    getUrl: adminProcedure
      .input(z.object({ channelSlug: z.string() }))
      .query(async ({ input }) => {
        const channel = await getChannelBySlug(input.channelSlug);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
        const baseUrl = ENV.oAuthServerUrl?.replace("api.", "") ?? "";
        return {
          feedUrl: `/api/roku/feed/${input.channelSlug}.json`,
          configUrl: `/api/roku/config/${input.channelSlug}.json`,
          absoluteFeedUrl: `${baseUrl}/api/roku/feed/${input.channelSlug}.json`,
        };
      }),

    /** Get in-memory cache status for all channel slugs. */
    cacheStatus: adminProcedure.query(() => {
      return getFeedCacheStatus();
    }),

    /** Get cache status for a single channel slug. */
    cacheStatusForSlug: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => {
        return getFeedCacheStatusForSlug(input.slug);
      }),

    /** Manually invalidate the cache for a specific channel slug. */
    invalidateCache: adminProcedure
      .input(z.object({ slug: z.string() }))
      .mutation(({ input }) => {
        const removed = invalidateFeedCache(input.slug);
        return { success: true, removed };
      }),

    /** Purge the entire feed cache. */
    purgeCache: adminProcedure.mutation(() => {
      const count = purgeAllFeedCache();
      return { success: true, purgedCount: count };
    }),
  }),
});

export type AppRouter = typeof appRouter;
