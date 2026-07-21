/**
 * AI Router — advanced AI features for the SennaVision Roku Content Platform
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, or } from "drizzle-orm";
import { getDb } from "../db.js";
import { aiJobs, videos, channelVideos } from "../../drizzle/schema.js";
import { invokeLLM } from "../_core/llm.js";
import { adminProcedure, router } from "../_core/trpc.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoRow = {
  id: number;
  title: string;
  description: string | null;
  tags: unknown;
  contentType: string | null;
  contentRating: string | null;
  language: string | null;
  durationSeconds: number | null;
  streamUrl: string | null;
  thumbnailUrl: string | null;
};

type EnrichResult = {
  title: string;
  description: string;
  tags: string[];
  contentRating: string;
  contentType: string | null;
  reasoning: string;
  confidence: number;
  streamInferenceHints: string[];
};

const VALID_RATINGS = ["all", "G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"] as const;
type ContentRating = typeof VALID_RATINGS[number];

function getLLMContent(response: Awaited<ReturnType<typeof invokeLLM>>): string {
  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("LLM returned empty response");
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

// ─── Stream URL inference helper ────────────────────────────────────────────
type StreamInference = {
  suggestedContentType: string | null;
  suggestedContentRating: string | null;
  hints: string[];
};
function inferStreamUrlMetadata(streamUrl: string | null): StreamInference {
  if (!streamUrl) return { suggestedContentType: null, suggestedContentRating: null, hints: [] };
  const url = streamUrl.toLowerCase();
  const hints: string[] = [];
  // Content type inference from URL patterns
  let suggestedContentType: string | null = null;
  if (url.includes(".m3u8") || url.includes("/hls/") || url.includes("manifest.m3u8")) {
    suggestedContentType = "movie";
    hints.push("HLS stream detected — likely long-form content (movie/episode)");
  } else if (url.includes(".mpd") || url.includes("/dash/") || url.includes("manifest.mpd")) {
    suggestedContentType = "movie";
    hints.push("DASH stream detected — likely long-form content (movie/episode)");
  } else if (url.includes(".mp4") || url.includes("/mp4/")) {
    suggestedContentType = "clip";
    hints.push("MP4 file detected — likely short-form clip");
  }
  // Short-form signals
  if (url.includes("short") || url.includes("clip") || url.includes("trailer") || url.includes("preview")) {
    suggestedContentType = "clip";
    hints.push("URL path suggests short-form content");
  }
  // Episode/series signals
  if (/s\d{1,2}e\d{1,2}/.test(url) || url.includes("/episode/") || url.includes("/series/")) {
    suggestedContentType = "episode";
    hints.push("URL path suggests episode/series content");
  }
  // Content rating inference from URL patterns
  let suggestedContentRating: string | null = null;
  if (url.includes("/kids/") || url.includes("/children/") || url.includes("/family/") || url.includes("/tvy/")) {
    suggestedContentRating = "TV-Y";
    hints.push("URL path suggests children/family content (TV-Y)");
  } else if (url.includes("/mature/") || url.includes("/adult/") || url.includes("/r18/") || url.includes("/tvma/")) {
    suggestedContentRating = "TV-MA";
    hints.push("URL path suggests mature content (TV-MA)");
  } else if (url.includes("/pg/") || url.includes("/family") || url.includes("/tvpg/")) {
    suggestedContentRating = "TV-PG";
    hints.push("URL path suggests general audience content (TV-PG)");
  }
  return { suggestedContentType, suggestedContentRating, hints };
}
// ─── Core enrichment helper ───────────────────────────────────────────────────
async function enrichSingleVideo(video: VideoRow): Promise<EnrichResult> {
  const existingTags: string[] = (() => {
    try {
      if (!video.tags) return [];
      const raw = typeof video.tags === "string" ? video.tags : JSON.stringify(video.tags);
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  })();
  // Infer content type and rating from stream URL
  const streamInference = inferStreamUrlMetadata(video.streamUrl);
  const inferenceContext = streamInference.hints.length > 0
    ? `\nStream URL Analysis:\n${streamInference.hints.map((h) => `- ${h}`).join("\n")}${streamInference.suggestedContentType ? `\n- Suggested content type: ${streamInference.suggestedContentType}` : ""}${streamInference.suggestedContentRating ? `\n- Suggested content rating: ${streamInference.suggestedContentRating}` : ""}`
    : "";
  const effectiveContentType = streamInference.suggestedContentType ?? video.contentType ?? "clip";
  const effectiveContentRating = streamInference.suggestedContentRating ?? video.contentRating ?? "all";
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a professional Roku content metadata editor. Always respond with valid JSON only.",
      },
      {
        role: "user",
        content: `Given this video metadata, generate improved SEO-friendly content for the Roku Direct Publisher feed.
Current metadata:
- Title: ${video.title}
- Description: ${video.description || "(none)"}
- Content Type: ${effectiveContentType}
- Content Rating: ${effectiveContentRating}
- Language: ${video.language || "en"}
- Duration: ${video.durationSeconds ? `${Math.floor(video.durationSeconds / 60)} minutes` : "unknown"}
- Existing Tags: ${existingTags.length > 0 ? existingTags.join(", ") : "(none)"}${inferenceContext}
Requirements:
1. Title: Concise (max 100 chars), engaging, accurate.
2. Description: 2-3 sentences (100-300 chars), compelling, suitable for Roku channel listings.
3. Tags: 5-10 relevant lowercase tags.
4. ContentRating: One of: all, G, PG, PG-13, R, NC-17, TV-Y, TV-Y7, TV-G, TV-PG, TV-14, TV-MA. Use the stream URL analysis as a strong signal.
5. ContentType: One of: movie, episode, clip, short-form. Use the stream URL analysis as a strong signal.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "video_enrichment",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            contentRating: { type: "string" },
            contentType: { type: "string" },
            reasoning: { type: "string" },
            confidence: { type: "integer", description: "Overall confidence score 0-100 for these suggestions based on available metadata quality" },
          },
          required: ["title", "description", "tags", "contentRating", "contentType", "reasoning", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(getLLMContent(response)) as Omit<EnrichResult, "streamInferenceHints">;
  // Clamp confidence to 0-100 range
  const confidence = Math.max(0, Math.min(100, typeof parsed.confidence === "number" ? parsed.confidence : 70));
  return { ...parsed, confidence, streamInferenceHints: streamInference.hints };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const aiRouter = router({
  /** Enrich a single video's metadata using AI */
  enrichVideo: adminProcedure
    .input(
      z.object({
        videoId: z.number().int().positive(),
        apply: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const videoRows = await db.select().from(videos).where(eq(videos.id, input.videoId)).limit(1);
      if (!videoRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      const video = videoRows[0];

      const [jobResult] = await db.insert(aiJobs).values({
        jobType: "enrich_video",
        status: "running",
        videoId: input.videoId,
        inputPayload: {
          title: video.title,
          description: video.description,
          tags: video.tags,
          contentType: video.contentType,
        },
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      try {
        const enriched = await enrichSingleVideo(video);

        if (input.apply) {
          const safeRating: ContentRating = VALID_RATINGS.includes(enriched.contentRating as ContentRating)
            ? (enriched.contentRating as ContentRating)
            : (video.contentRating as ContentRating) ?? "all";

          await db.update(videos).set({
            title: enriched.title,
            description: enriched.description,
            tags: enriched.tags,
            contentRating: safeRating,
          }).where(eq(videos.id, input.videoId));
        }

        await db.update(aiJobs).set({
          status: "completed",
          outputPayload: enriched,
          resultSummary: `Enriched "${video.title}" → "${enriched.title}". ${enriched.reasoning}`,
          processedCount: 1,
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));

        return { jobId, applied: input.apply, result: enriched };
      } catch (err) {
        await db.update(aiJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `AI enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Generate tag suggestions for a video */
  generateTags: adminProcedure
    .input(z.object({ videoId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const videoRows = await db.select().from(videos).where(eq(videos.id, input.videoId)).limit(1);
      if (!videoRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      const video = videoRows[0];

      const [jobResult] = await db.insert(aiJobs).values({
        jobType: "generate_tags",
        status: "running",
        videoId: input.videoId,
        inputPayload: { title: video.title, description: video.description, contentType: video.contentType },
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a content tagging specialist for streaming platforms. Respond with valid JSON only.",
            },
            {
              role: "user",
              content: `Generate 8-12 relevant tags for this Roku video:
Title: ${video.title}
Description: ${video.description || "(none)"}
Content Type: ${video.contentType || "clip"}

Tags should be lowercase, concise, covering: genre, topic, mood, audience, and format.
Respond with JSON: { "tags": ["tag1", "tag2", ...] }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tag_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["tags"],
                additionalProperties: false,
              },
            },
          },
        });

        const { tags } = JSON.parse(getLLMContent(response)) as { tags: string[] };

        await db.update(aiJobs).set({
          status: "completed",
          outputPayload: { tags },
          resultSummary: `Generated ${tags.length} tags for "${video.title}"`,
          processedCount: 1,
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));

        return { jobId, tags };
      } catch (err) {
        await db.update(aiJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Tag generation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Validate a video's metadata for Roku compliance */
  validateContent: adminProcedure
    .input(z.object({ videoId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const videoRows = await db.select().from(videos).where(eq(videos.id, input.videoId)).limit(1);
      if (!videoRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      const video = videoRows[0];

      const [jobResult] = await db.insert(aiJobs).values({
        jobType: "validate_content",
        status: "running",
        videoId: input.videoId,
        inputPayload: {
          title: video.title,
          description: video.description,
          contentRating: video.contentRating,
          contentType: video.contentType,
          thumbnailUrl: video.thumbnailUrl ? "provided" : null,
          streamUrl: video.streamUrl ? "provided" : null,
          releaseDate: video.releaseDate,
        },
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a Roku Direct Publisher content compliance expert. Respond with valid JSON only.",
            },
            {
              role: "user",
              content: `Review this video metadata for Roku Direct Publisher compliance:

Title: ${video.title}
Description: ${video.description || "(missing)"}
Content Rating: ${video.contentRating || "(missing)"}
Content Type: ${video.contentType || "(missing)"}
Thumbnail URL: ${video.thumbnailUrl ? "provided" : "(missing)"}
Stream URL: ${video.streamUrl ? "provided" : "(missing)"}
Release Date: ${video.releaseDate || "(missing)"}

Check for: missing required fields, title/description length, content rating validity, quality issues.

Respond with JSON: {
  "score": 0-100,
  "issues": [{ "field": "fieldName", "severity": "error|warning|info", "message": "description" }],
  "suggestions": ["suggestion1"],
  "summary": "brief overall assessment"
}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "content_validation",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  score: { type: "number" },
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        field: { type: "string" },
                        severity: { type: "string" },
                        message: { type: "string" },
                      },
                      required: ["field", "severity", "message"],
                      additionalProperties: false,
                    },
                  },
                  suggestions: { type: "array", items: { type: "string" } },
                  summary: { type: "string" },
                },
                required: ["score", "issues", "suggestions", "summary"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = JSON.parse(getLLMContent(response)) as {
          score: number;
          issues: { field: string; severity: string; message: string }[];
          suggestions: string[];
          summary: string;
        };

        await db.update(aiJobs).set({
          status: "completed",
          outputPayload: result,
          resultSummary: `Compliance score: ${result.score}/100 — ${result.issues.length} issue(s). ${result.summary}`,
          processedCount: 1,
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));

        return { jobId, result };
      } catch (err) {
        await db.update(aiJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Content validation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Generate a description for a video */
  generateDescription: adminProcedure
    .input(z.object({
      videoId: z.number().int().positive(),
      apply: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const videoRows = await db.select().from(videos).where(eq(videos.id, input.videoId)).limit(1);
      if (!videoRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
      const video = videoRows[0];

      const [jobResult] = await db.insert(aiJobs).values({
        jobType: "generate_description",
        status: "running",
        videoId: input.videoId,
        inputPayload: { title: video.title, contentType: video.contentType, contentRating: video.contentRating },
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a professional content writer for streaming platforms. Respond with valid JSON only.",
            },
            {
              role: "user",
              content: `Write a compelling description for this Roku video:
Title: ${video.title}
Content Type: ${video.contentType || "clip"}
Content Rating: ${video.contentRating || "all"}
Existing Description: ${video.description || "(none)"}

Write a 2-3 sentence description (100-300 characters) that is engaging and suitable for Roku channel listings.
Respond with JSON: { "description": "...", "reasoning": "..." }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "description_generation",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  reasoning: { type: "string" },
                },
                required: ["description", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        });

        const { description, reasoning } = JSON.parse(getLLMContent(response)) as {
          description: string;
          reasoning: string;
        };

        if (input.apply) {
          await db.update(videos).set({ description }).where(eq(videos.id, input.videoId));
        }

        await db.update(aiJobs).set({
          status: "completed",
          outputPayload: { description, reasoning },
          resultSummary: `Generated description for "${video.title}"`,
          processedCount: 1,
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));

        return { jobId, description, reasoning, applied: input.apply };
      } catch (err) {
        await db.update(aiJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(aiJobs.id, jobId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Description generation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /** Bulk enrich videos in a channel */
    bulkEnrich: adminProcedure
    .input(
      z.object({
        channelId: z.number().int().positive().optional(),
        videoIds: z.array(z.number().int().positive()).optional(),
        onlyMissing: z.boolean().default(true),
        apply: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(20),
      }).refine((d) => d.channelId !== undefined || (d.videoIds && d.videoIds.length > 0), {
        message: "Either channelId or videoIds must be provided",
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let videoIds: number[];
      if (input.videoIds && input.videoIds.length > 0) {
        videoIds = input.videoIds;
      } else {
        const channelVideoRows = await db
          .select({ videoId: channelVideos.videoId })
          .from(channelVideos)
          .where(eq(channelVideos.channelId, input.channelId!))
          .limit(input.limit);
        if (channelVideoRows.length === 0) {
          return { jobId: null, processed: 0, failed: 0, results: [], message: "No videos in this channel." };
        }
        videoIds = channelVideoRows.map((r) => r.videoId);
      };
      const videoRows = await db
        .select()
        .from(videos)
        .where(videoIds.length === 1 ? eq(videos.id, videoIds[0]) : or(...videoIds.map((id) => eq(videos.id, id))));

      const toEnrich = input.onlyMissing
        ? videoRows.filter((v) => !v.description || !v.tags || (Array.isArray(v.tags) && (v.tags as string[]).length === 0))
        : videoRows;

      if (toEnrich.length === 0) {
        return { jobId: null, processed: 0, failed: 0, results: [], message: "All videos already have descriptions and tags." };
      }

      const [jobResult] = await db.insert(aiJobs).values({
        jobType: "bulk_enrich",
        status: "running",
        channelId: input.channelId,
        inputPayload: { videoIds: toEnrich.map((v) => v.id), onlyMissing: input.onlyMissing, apply: input.apply },
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      const results: { videoId: number; title: string; status: "ok" | "failed"; result?: EnrichResult; error?: string }[] = [];
      let processedCount = 0;
      let failedCount = 0;

      for (const video of toEnrich) {
        try {
          const enriched = await enrichSingleVideo(video);

          if (input.apply) {
            const safeRating: ContentRating = VALID_RATINGS.includes(enriched.contentRating as ContentRating)
              ? (enriched.contentRating as ContentRating)
              : (video.contentRating as ContentRating) ?? "all";

            await db.update(videos).set({
              title: enriched.title,
              description: enriched.description,
              tags: enriched.tags,
              contentRating: safeRating,
            }).where(eq(videos.id, video.id));
          }

          results.push({ videoId: video.id, title: video.title, status: "ok", result: enriched });
          processedCount++;
        } catch (err) {
          results.push({
            videoId: video.id,
            title: video.title,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
          failedCount++;
        }
      }

      await db.update(aiJobs).set({
        status: failedCount === toEnrich.length ? "failed" : "completed",
        outputPayload: { results },
        resultSummary: `Bulk enriched ${processedCount}/${toEnrich.length} videos. ${failedCount} failed.`,
        processedCount,
        failedCount,
        completedAt: new Date(),
      }).where(eq(aiJobs.id, jobId));

      return { jobId, processed: processedCount, failed: failedCount, results };
    }),

  /** List AI job history */
  listJobs: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        videoId: z.number().int().positive().optional(),
        channelId: z.number().int().positive().optional(),
        jobType: z
          .enum(["enrich_video", "bulk_enrich", "generate_tags", "validate_content", "generate_description", "generate_title"])
          .optional(),
        status: z.enum(["pending", "running", "completed", "failed"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [];
      if (input.videoId) conditions.push(eq(aiJobs.videoId, input.videoId));
      if (input.channelId) conditions.push(eq(aiJobs.channelId, input.channelId));
      if (input.jobType) conditions.push(eq(aiJobs.jobType, input.jobType));
      if (input.status) conditions.push(eq(aiJobs.status, input.status));

      return db
        .select()
        .from(aiJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(aiJobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /** Get a single AI job with full output */
  getJob: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(aiJobs).where(eq(aiJobs.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return rows[0];
    }),

  /** Apply approved enrichment fields to a video (called after diff dialog approval) */
  applyEnrichment: adminProcedure
    .input(
      z.object({
        videoId: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string(),
        tags: z.array(z.string()),
        contentRating: z.string().optional(),
        jobId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const safeRating: ContentRating = VALID_RATINGS.includes(input.contentRating as ContentRating)
        ? (input.contentRating as ContentRating)
        : "all";
      await db.update(videos).set({
        title: input.title,
        description: input.description,
        tags: input.tags,
        contentRating: safeRating,
      }).where(eq(videos.id, input.videoId));
      if (input.jobId) {
        await db.update(aiJobs).set({ status: "completed" }).where(eq(aiJobs.id, input.jobId));
      }
      return { applied: true };
    }),

  /** Retry a failed AI job */
  retryJob: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(aiJobs).where(eq(aiJobs.id, input.id)).limit(1);
      const job = rows[0];
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.status !== "failed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed jobs can be retried" });
      await db.update(aiJobs).set({
        status: "running",
        errorMessage: null,
        completedAt: null,
      }).where(eq(aiJobs.id, input.id));
      try {
        if (job.jobType === "enrich_video" && job.videoId) {
          const videoRows = await db.select().from(videos).where(eq(videos.id, job.videoId)).limit(1);
          if (!videoRows[0]) throw new Error("Video not found");
          const enriched = await enrichSingleVideo(videoRows[0]);
          const safeRating: ContentRating = VALID_RATINGS.includes(enriched.contentRating as ContentRating)
            ? (enriched.contentRating as ContentRating)
            : (videoRows[0].contentRating as ContentRating) ?? "all";
          await db.update(videos).set({
            title: enriched.title,
            description: enriched.description,
            tags: enriched.tags,
            contentRating: safeRating,
          }).where(eq(videos.id, job.videoId));
          await db.update(aiJobs).set({
            status: "completed",
            outputPayload: enriched,
            resultSummary: `Retried: enriched "${videoRows[0].title}" to "${enriched.title}".`,
            processedCount: 1,
            failedCount: 0,
            completedAt: new Date(),
          }).where(eq(aiJobs.id, input.id));
          return { success: true, jobType: job.jobType };
        }
        throw new Error(`Retry not supported for job type: ${job.jobType}`);
      } catch (err) {
        await db.update(aiJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        }).where(eq(aiJobs.id, input.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : String(err) });
      }
    }),

  /** Get last AI enrichment job per video ID */
  videoEnrichHistory: adminProcedure
    .input(z.object({ videoIds: z.array(z.number().int().positive()).min(1).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const jobs = await db
        .select({
          id: aiJobs.id,
          videoId: aiJobs.videoId,
          outputPayload: aiJobs.outputPayload,
          completedAt: aiJobs.completedAt,
          createdAt: aiJobs.createdAt,
        })
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.jobType, "enrich_video"),
            eq(aiJobs.status, "completed"),
            input.videoIds.length === 1
              ? eq(aiJobs.videoId, input.videoIds[0])
              : or(...input.videoIds.map((id) => eq(aiJobs.videoId, id)))
          )
        )
        .orderBy(desc(aiJobs.completedAt));
      // Keep only the most recent job per videoId
      const historyMap: Record<number, { jobId: number; enrichedAt: Date | null; confidence: number | null }> = {};
      for (const job of jobs) {
        if (job.videoId === null) continue;
        if (historyMap[job.videoId]) continue;
        const payload = job.outputPayload as Record<string, unknown> | null;
        const confidence = typeof payload?.confidence === "number" ? payload.confidence : null;
        historyMap[job.videoId] = {
          jobId: job.id,
          enrichedAt: job.completedAt ?? job.createdAt,
          confidence,
        };
      }
      return historyMap;
    }),
});
