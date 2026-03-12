import { describe, expect, it } from "vitest";
import {
  validateVideo,
  generateRokuFeed,
  generateValidationReport,
  type FeedRow,
  type FeedVideoRow,
} from "./feedGenerator";
import type { Channel, Video } from "../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 1,
    name: "Test Channel",
    slug: "test-channel",
    description: "A test channel",
    language: "en",
    contentRating: "all",
    status: "active",
    feedPath: "/api/roku/feed/test-channel.json",
    themeJson: null,
    featureFlagsJson: null,
    adSettingsJson: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 1,
    title: "Test Video",
    slug: "test-video",
    description: "A test video description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    streamUrl: "https://example.com/video.mp4",
    durationSeconds: 120,
    releaseDate: "2024-01-15",
    contentRating: "all",
    contentType: "clip",
    language: "en",
    publishStatus: "published",
    validationStatus: "unchecked",
    validationErrors: null,
    rightsOwner: null,
    tags: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

// ─── validateVideo ─────────────────────────────────────────────────────────────

describe("validateVideo", () => {
  it("returns valid for a complete video", () => {
    const result = validateVideo(makeVideo());
    expect(result.status).toBe("valid");
    expect(result.issues).toHaveLength(0);
  });

  it("returns error when title is missing", () => {
    const result = validateVideo(makeVideo({ title: "" }));
    expect(result.status).toBe("error");
    expect(result.issues).toContain("Missing title");
  });

  it("returns error when thumbnail is missing", () => {
    const result = validateVideo(makeVideo({ thumbnailUrl: null }));
    expect(result.status).toBe("error");
    expect(result.issues).toContain("Missing thumbnail URL");
  });

  it("returns error when stream URL is missing", () => {
    const result = validateVideo(makeVideo({ streamUrl: null }));
    expect(result.status).toBe("error");
    expect(result.issues).toContain("Missing stream URL");
  });

  it("returns error when duration is zero", () => {
    const result = validateVideo(makeVideo({ durationSeconds: 0 }));
    expect(result.status).toBe("error");
    expect(result.issues).toContain("Invalid or missing duration");
  });

  it("returns warning when description is missing", () => {
    const result = validateVideo(makeVideo({ description: null }));
    expect(result.status).toBe("warning");
    expect(result.issues).toContain("Missing description (recommended)");
  });

  it("returns warning when release date is missing", () => {
    const result = validateVideo(makeVideo({ releaseDate: null }));
    expect(result.status).toBe("warning");
    expect(result.issues).toContain("Missing release date (recommended)");
  });

  it("prioritises error over warning when both are present", () => {
    const result = validateVideo(makeVideo({ title: "", description: null }));
    expect(result.status).toBe("error");
  });
});

// ─── generateRokuFeed ──────────────────────────────────────────────────────────

describe("generateRokuFeed", () => {
  const channel = makeChannel();
  const video = makeVideo();

  const rows: FeedRow[] = [
    {
      row: {
        id: 1,
        channelId: 1,
        categoryId: 10,
        rowTitle: "Featured",
        rowOrder: 0,
        isVisible: true,
        createdAt: new Date(),
      },
      category: { id: 10, name: "Featured", slug: "featured", description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    },
  ];

  const channelVideoRows: FeedVideoRow[] = [
    {
      assignment: {
        id: 1,
        channelId: 1,
        videoId: 1,
        featuredFlag: false,
        sortOrder: 0,
        publishFrom: null,
        publishTo: null,
        createdAt: new Date(),
      },
      video,
    },
  ];

  const vcMappings = [{ videoId: 1, categoryId: 10 }];

  it("produces a feed with correct providerName", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(feed.providerName).toBe("Test Channel");
  });

  it("produces a feed with language from channel", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(feed.language).toBe("en");
  });

  it("includes the video in shortFormVideos when duration < 20 min", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(feed.shortFormVideos).toHaveLength(1);
    expect(feed.shortFormVideos![0]!.title).toBe("Test Video");
  });

  it("includes the video in movies when duration >= 10 min and contentType is movie", () => {
    const longVideo = makeVideo({ durationSeconds: 1200, contentType: "movie" }); // 20 min, movie type
    const longRows: FeedVideoRow[] = [
      { assignment: channelVideoRows[0]!.assignment, video: longVideo },
  ];
    const feed = generateRokuFeed(channel, rows, longRows, vcMappings);
    expect(feed.movies).toHaveLength(1);
    expect(feed.shortFormVideos ?? []).toHaveLength(0);
  });

  it("generates categories from rows", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(feed.categories).toHaveLength(1);
    expect(feed.categories![0]!.name).toBe("Featured");
  });

  it("generates playlists matching categories", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(feed.playlists).toHaveLength(1);
    expect(feed.playlists![0]!.itemIds).toContain("video_1");
  });

  it("excludes unpublished videos", () => {
    const draftVideo = makeVideo({ publishStatus: "draft" });
    const draftRows: FeedVideoRow[] = [
      { assignment: channelVideoRows[0]!.assignment, video: draftVideo },
    ];
    const feed = generateRokuFeed(channel, rows, draftRows, vcMappings);
    expect(feed.shortFormVideos ?? []).toHaveLength(0);
  });

  it("returns lastUpdated as an ISO string", () => {
    const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
    expect(() => new Date(feed.lastUpdated)).not.toThrow();
    expect(feed.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── generateValidationReport ──────────────────────────────────────────────────

describe("generateValidationReport", () => {
  const channel = makeChannel();
  const video = makeVideo();

  const rows: FeedRow[] = [
    {
      row: {
        id: 1, channelId: 1, categoryId: 10, rowTitle: "Row A",
        rowOrder: 0, isVisible: true,
        createdAt: new Date(),
      },
      category: { id: 10, name: "Row A", slug: "row-a", description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    },
  ];

  const channelVideoRows: FeedVideoRow[] = [
    {
      assignment: {
        id: 1, channelId: 1, videoId: 1, featuredFlag: false, sortOrder: 0,
        publishFrom: null, publishTo: null, createdAt: new Date(),
      },
      video,
    },
  ];

  const vcMappings = [{ videoId: 1, categoryId: 10 }];

  it("marks feedReady true for active channel with valid videos", () => {
    const report = generateValidationReport(channel, rows, channelVideoRows, vcMappings);
    expect(report.feedReady).toBe(true);
  });

  it("marks feedReady false for inactive channel", () => {
    const inactiveChannel = makeChannel({ status: "inactive" });
    const report = generateValidationReport(inactiveChannel, rows, channelVideoRows, vcMappings);
    expect(report.feedReady).toBe(false);
  });

  it("marks feedReady false when there are invalid videos", () => {
    const badVideo = makeVideo({ title: "", streamUrl: null });
    const badRows: FeedVideoRow[] = [
      { assignment: channelVideoRows[0]!.assignment, video: badVideo },
    ];
    const report = generateValidationReport(channel, rows, badRows, vcMappings);
    expect(report.feedReady).toBe(false);
    expect(report.invalidVideos).toBeGreaterThan(0);
  });

  it("reports empty rows when no videos are assigned to a category", () => {
    const report = generateValidationReport(channel, rows, channelVideoRows, []);
    expect(report.emptyRows).toContain("Row A");
  });

  it("counts total videos correctly", () => {
    const report = generateValidationReport(channel, rows, channelVideoRows, vcMappings);
    expect(report.totalVideosInChannel).toBe(1);
  });

  it("counts valid videos correctly", () => {
    const report = generateValidationReport(channel, rows, channelVideoRows, vcMappings);
    expect(report.validVideos).toBe(1);
    expect(report.invalidVideos).toBe(0);
  });
});

// ─── Auth logout (regression) ─────────────────────────────────────────────────

import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const cleared: { name: string; options: Record<string, unknown> }[] = [];
    const ctx: TrpcContext = {
      user: {
        id: 1, openId: "u1", email: "a@b.com", name: "A", loginMethod: "manus",
        role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, opts: Record<string, unknown>) => cleared.push({ name, options: opts }),
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(cleared[0]?.name).toBe(COOKIE_NAME);
    expect(cleared[0]?.options).toMatchObject({ maxAge: -1 });
  });
});
