import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Papa from "papaparse";
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
import { videos } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Role guard ───────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "content_manager" && ctx.user.role !== "publishing_manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Slug helper ──────────────────────────────────────────────────────────────
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function makeUniqueSlug(base: string, suffix: number): string {
  return suffix === 0 ? base : `${base}-${suffix}`;
}

// ─── CSV row schema ───────────────────────────────────────────────────────────
const csvRowSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  thumbnailUrl: z.string().url("thumbnailUrl must be a valid URL").optional().or(z.literal("")),
  streamUrl: z.string().url("streamUrl must be a valid URL").optional().or(z.literal("")),
  durationSeconds: z.coerce.number().int().nonnegative().optional(),
  language: z.string().optional(),
  contentType: z
    .enum(["movie", "series", "episode", "short", "clip", "special"])
    .optional(),
  contentRating: z.string().optional(),
  releaseDate: z.string().optional(),
  rightsOwner: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  publishStatus: z
    .enum(["draft", "pending", "approved", "published", "archived"])
    .optional(),
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

    // Warnings for recommended fields
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
    .input(
      z.object({
        csvText: z.string().min(1, "CSV content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const { rows, headers } = parseCsvText(input.csvText);
      const validCount = rows.filter((r) => r.status === "valid").length;
      const warningCount = rows.filter((r) => r.status === "warning").length;
      const errorCount = rows.filter((r) => r.status === "error").length;
      return { rows, headers, validCount, warningCount, errorCount, total: rows.length };
    }),

  /** Bulk import parsed rows into the database */
  bulkImport: adminProcedure
    .input(
      z.object({
        csvText: z.string().min(1),
        /** Override channel slug for all rows (optional — row-level channelSlug takes precedence) */
        defaultChannelSlug: z.string().optional(),
        /** Override category slug for all rows (optional — row-level categorySlug takes precedence) */
        defaultCategorySlug: z.string().optional(),
        /** Skip rows with errors instead of aborting */
        skipErrors: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const { rows } = parseCsvText(input.csvText);

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
        // Skip hard-error rows if configured
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

        // Duplicate slug detection — find a unique slug
        let slug = baseSlug;
        let suffix = 0;
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
            continue;
          }
        }

        try {
          // Parse tags
          const tags = data.tags
            ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];

          // Create the video
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

          // Fetch the newly created video ID
          const db = await getDb();
          if (!db) throw new Error("DB unavailable");
          const [created] = await db.select().from(videos).where(eq(videos.slug, slug)).limit(1);
          if (!created) throw new Error("Video not found after insert");

          const videoId = created.id;

          // Resolve channel
          const channelSlug = data.channelSlug || input.defaultChannelSlug;
          if (channelSlug) {
            const channel = await getChannelBySlug(channelSlug);
            if (channel) {
              await assignVideoToChannel({ channelId: channel.id, videoId });

              // Resolve category
              const categorySlug = data.categorySlug || input.defaultCategorySlug;
              if (categorySlug) {
                const category = await getCategoryBySlug(categorySlug);
                if (category) {
                  await setVideoCategories(videoId, [category.id]);
                }
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

      return {
        results,
        importedCount,
        skippedCount,
        duplicateCount,
        errorCount,
        total: rows.length,
      };
    }),

  /** Return the CSV template as a string */
  getTemplate: adminProcedure.query(() => {
    const headers = [
      "title",
      "description",
      "thumbnailUrl",
      "streamUrl",
      "durationSeconds",
      "language",
      "contentType",
      "contentRating",
      "releaseDate",
      "rightsOwner",
      "tags",
      "publishStatus",
      "channelSlug",
      "categorySlug",
    ];
    const example = [
      "My Awesome Video",
      "A short description of the video",
      "https://example.com/thumb.jpg",
      "https://example.com/video.mp4",
      "120",
      "en",
      "clip",
      "all",
      "2024-01-15",
      "RILAN GAMES LLC",
      "gaming,action",
      "draft",
      "shorts-tv",
      "featured",
    ];
    return [headers.join(","), example.join(",")].join("\n");
  }),
});
