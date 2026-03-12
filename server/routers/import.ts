import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Papa from "papaparse";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createVideo,
  getVideoBySlug,
  getChannelBySlug,
  getCategoryBySlug,
  assignVideoToChannel,
  setVideoCategories,
  getDb,
} from "../db";
import { importLogs, videos } from "../../drizzle/schema";
import { storagePut } from "../storage";

// ─── Role guard ───────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (
    ctx.user.role !== "admin" &&
    ctx.user.role !== "content_manager" &&
    ctx.user.role !== "publishing_manager"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Slug helpers ─────────────────────────────────────────────────────────────
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function makeUniqueSlug(base: string, suffix: number): string {
  return suffix === 0 ? base : `${base}-${suffix}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ─── CSV row schema ───────────────────────────────────────────────────────────
const csvRowSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  thumbnailUrl: z.string().url("thumbnailUrl must be a valid URL").optional().or(z.literal("")),
  streamUrl: z.string().url("streamUrl must be a valid URL").optional().or(z.literal("")),
  durationSeconds: z.coerce.number().int().nonnegative().optional(),
  language: z.string().optional(),
  contentType: z.enum(["movie", "series", "episode", "short", "clip", "special"]).optional(),
  contentRating: z.string().optional(),
  releaseDate: z.string().optional(),
  rightsOwner: z.string().optional(),
  tags: z.string().optional(),
  publishStatus: z.enum(["draft", "pending", "approved", "published", "archived"]).optional(),
  channelSlug: z.string().optional(),
  categorySlug: z.string().optional(),
});

export type CsvRowInput = z.infer<typeof csvRowSchema>;

// ─── Per-row validation result ────────────────────────────────────────────────
export interface ParsedRow {
  rowIndex: number;
  data: CsvRowInput;
  status: "valid" | "warning" | "error";
  issues: string[];
}

export function parseCsvText(csvText: string): { rows: ParsedRow[]; headers: string[] } {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows: ParsedRow[] = result.data.map((raw, i) => {
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((e: any) => `${e.path.join(".")}: ${e.message}`);
      return { rowIndex: i + 1, data: raw as unknown as CsvRowInput, status: "error" as const, issues };
    }
    const data = parsed.data;
    const issues: string[] = [];
    if (!data.thumbnailUrl) issues.push("thumbnailUrl missing (recommended)");
    if (!data.streamUrl) issues.push("streamUrl missing (recommended)");
    if (!data.durationSeconds) issues.push("durationSeconds missing (recommended)");
    if (!data.description) issues.push("description missing (recommended)");
    return {
      rowIndex: i + 1,
      data,
      status: issues.length > 0 ? ("warning" as const) : ("valid" as const),
      issues,
    };
  });

  return { rows, headers };
}

// ─── Import router ────────────────────────────────────────────────────────────
export const importRouter = router({
  /** Parse CSV text and return per-row validation results without writing to DB */
  parsePreview: adminProcedure
    .input(z.object({ csvText: z.string().min(1, "CSV content is required") }))
    .mutation(async ({ input }) => {
      const { rows, headers } = parseCsvText(input.csvText);
      const validCount = rows.filter((r) => r.status === "valid").length;
      const warningCount = rows.filter((r) => r.status === "warning").length;
      const errorCount = rows.filter((r) => r.status === "error").length;
      return { rows, headers, validCount, warningCount, errorCount, total: rows.length };
    }),

  /** Bulk import parsed rows into the database and persist an import log */
  bulkImport: adminProcedure
    .input(
      z.object({
        csvText: z.string().min(1),
        filename: z.string().default("import.csv"),
        defaultChannelSlug: z.string().optional(),
        defaultCategorySlug: z.string().optional(),
        skipErrors: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { rows } = parseCsvText(input.csvText);

      // ── Upload original CSV to S3 ──────────────────────────────────────────
      let csvS3Key: string | null = null;
      let csvUrl: string | null = null;
      try {
        const key = `import-logs/${Date.now()}-${randomSuffix()}-${input.filename}`;
        const uploaded = await storagePut(key, Buffer.from(input.csvText, "utf-8"), "text/csv");
        csvS3Key = uploaded.key;
        csvUrl = uploaded.url;
      } catch (err) {
        console.warn("[Import] Failed to upload CSV to S3:", err);
      }

      // ── Process rows ──────────────────────────────────────────────────────
      const results: Array<{
        rowIndex: number;
        title: string;
        status: "imported" | "skipped" | "duplicate" | "error";
        reason?: string;
        videoId?: number;
      }> = [];

      let importedCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        if (row.status === "error" && input.skipErrors) {
          results.push({
            rowIndex: row.rowIndex,
            title: row.data.title ?? `Row ${row.rowIndex}`,
            status: "skipped",
            reason: row.issues.join("; "),
          });
          skippedCount++;
          continue;
        }

        const data = row.data;
        const baseSlug = slugify(data.title);
        let slug = baseSlug;
        let suffix = 0;
        let isDuplicate = false;

        while (true) {
          const existing = await getVideoBySlug(slug);
          if (!existing) break;
          suffix++;
          slug = makeUniqueSlug(baseSlug, suffix);
          if (suffix > 100) {
            results.push({
              rowIndex: row.rowIndex,
              title: data.title,
              status: "duplicate",
              reason: `Could not generate unique slug for "${data.title}"`,
            });
            duplicateCount++;
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) continue;

        try {
          const tags = data.tags
            ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];

          await createVideo({
            title: data.title,
            slug,
            description: data.description ?? null,
            thumbnailUrl: data.thumbnailUrl || null,
            streamUrl: data.streamUrl || null,
            durationSeconds: data.durationSeconds ?? null,
            language: data.language ?? "en",
            contentType: (data.contentType as any) ?? "clip",
            contentRating: data.contentRating ?? "all",
            releaseDate: data.releaseDate ?? null,
            rightsOwner: data.rightsOwner ?? null,
            publishStatus: (data.publishStatus as any) ?? "draft",
            tags: tags.length > 0 ? tags : null,
          });

          const db = await getDb();
          if (!db) throw new Error("DB unavailable");
          const [created] = await db.select().from(videos).where(eq(videos.slug, slug)).limit(1);
          if (!created) throw new Error("Video not found after insert");

          const videoId = created.id;

          const channelSlug = data.channelSlug || input.defaultChannelSlug;
          if (channelSlug) {
            const channel = await getChannelBySlug(channelSlug);
            if (channel) {
              await assignVideoToChannel({ channelId: channel.id, videoId });
              const categorySlug = data.categorySlug || input.defaultCategorySlug;
              if (categorySlug) {
                const category = await getCategoryBySlug(categorySlug);
                if (category) await setVideoCategories(videoId, [category.id]);
              }
            }
          }

          results.push({ rowIndex: row.rowIndex, title: data.title, status: "imported", videoId });
          importedCount++;
        } catch (err: any) {
          results.push({
            rowIndex: row.rowIndex,
            title: data.title ?? `Row ${row.rowIndex}`,
            status: "error",
            reason: err?.message ?? "Unknown error",
          });
          errorCount++;
        }
      }

      // ── Persist import log ────────────────────────────────────────────────
      const db = await getDb();
      if (db) {
        try {
          await db.insert(importLogs).values({
            filename: input.filename,
            csvS3Key,
            csvUrl,
            totalRows: rows.length,
            importedCount,
            skippedCount,
            duplicateCount,
            errorCount,
            resultsJson: results,
            defaultChannelSlug: input.defaultChannelSlug ?? null,
            defaultCategorySlug: input.defaultCategorySlug ?? null,
            importedBy: ctx.user.id,
            importedByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
          });
        } catch (err) {
          console.warn("[Import] Failed to save import log:", err);
        }
      }

      return { results, importedCount, skippedCount, duplicateCount, errorCount, total: rows.length };
    }),

  /** Return the CSV template as a string */
  getTemplate: adminProcedure.query(() => {
    const headers = [
      "title", "description", "thumbnailUrl", "streamUrl", "durationSeconds",
      "language", "contentType", "contentRating", "releaseDate", "rightsOwner",
      "tags", "publishStatus", "channelSlug", "categorySlug",
    ];
    const example = [
      "My Awesome Video", "A short description of the video",
      "https://example.com/thumb.jpg", "https://example.com/video.mp4",
      "120", "en", "clip", "all", "2024-01-15", "RILAN GAMES LLC",
      "gaming,action", "draft", "shorts-tv", "featured",
    ];
    return [headers.join(","), example.join(",")].join("\n");
  }),

  // ─── Import Log management ──────────────────────────────────────────────────

  /** List all import logs, newest first */
  listLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0 };
      const limit = input?.limit ?? 50;
      const rows = await db
        .select()
        .from(importLogs)
        .orderBy(desc(importLogs.createdAt))
        .limit(limit);
      return { logs: rows, total: rows.length };
    }),

  /** Get a single import log by ID (includes full resultsJson) */
  getLog: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [log] = await db.select().from(importLogs).where(eq(importLogs.id, input.id)).limit(1);
      if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Import log not found" });
      return log;
    }),

  /** Delete an import log record (does NOT delete the videos that were imported) */
  deleteLog: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [log] = await db.select().from(importLogs).where(eq(importLogs.id, input.id)).limit(1);
      if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Import log not found" });
      await db.delete(importLogs).where(eq(importLogs.id, input.id));
      return { success: true };
    }),

  /**
   * Fetch the original CSV for a past import log from S3 and return it as a
   * UTF-8 text string so the frontend can reconstruct a File object and
   * pre-populate the Import Videos page without re-uploading.
   */
  getReimportData: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [log] = await db
        .select()
        .from(importLogs)
        .where(eq(importLogs.id, input.id))
        .limit(1);
      if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Import log not found" });

      if (!log.csvS3Key && !log.csvUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No CSV file was stored for this import. It may have been created before file storage was enabled.",
        });
      }

      // Prefer fetching a fresh signed URL from S3 key; fall back to stored URL
      let downloadUrl: string;
      if (log.csvS3Key) {
        try {
          const { storageGet } = await import("../storage");
          const result = await storageGet(log.csvS3Key);
          downloadUrl = result.url;
        } catch {
          if (!log.csvUrl) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to generate download URL for the stored CSV.",
            });
          }
          downloadUrl = log.csvUrl;
        }
      } else {
        downloadUrl = log.csvUrl!;
      }

      // Fetch the CSV bytes from S3
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch CSV from storage (HTTP ${response.status}).`,
        });
      }
      const csvText = await response.text();

      return {
        logId: log.id,
        filename: log.filename ?? "reimport.csv",
        csvText,
        defaultChannelSlug: log.defaultChannelSlug ?? undefined,
        defaultCategorySlug: log.defaultCategorySlug ?? undefined,
        originalStats: {
          totalRows: log.totalRows,
          importedCount: log.importedCount,
          skippedCount: log.skippedCount,
          duplicateCount: log.duplicateCount,
          errorCount: log.errorCount,
        },
      };
    }),
});
