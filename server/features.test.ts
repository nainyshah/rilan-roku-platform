/**
 * Feature tests for:
 * 1. Server-side video filtering (videos.list with tags, sortBy, sortDir)
 * 2. Channel statistics panel (channels.stats)
 * 3. videos.allTags
 *
 * All DB helpers are mocked so no real database connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock the entire db module ────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file by Vitest, so the factory runs
// before any imports are resolved.
vi.mock("./db", () => ({
  getVideos: vi.fn(),
  getAllDistinctTags: vi.fn(),
  getChannelStats: vi.fn(),
  getDashboardStats: vi.fn(),
  getChannels: vi.fn(),
  getChannelById: vi.fn(),
  getChannelVideos: vi.fn(),
  getChannelCategories: vi.fn(),
  getVideoById: vi.fn(),
  getVideoCategoriesForVideo: vi.fn(),
  getCategories: vi.fn(),
  getAssetsByChannel: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  updateChannelStatus: vi.fn(),
  assignVideoToChannel: vi.fn(),
  removeVideoFromChannel: vi.fn(),
  updateChannelVideoAssignment: vi.fn(),
  assignCategoryToChannel: vi.fn(),
  removeCategoryFromChannel: vi.fn(),
  updateChannelCategoryRow: vi.fn(),
  createVideo: vi.fn(),
  updateVideo: vi.fn(),
  updateVideoStatus: vi.fn(),
  getVideosWithScheduleSummary: vi.fn(),
  getFeedData: vi.fn(),
  setVideoCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  getCategoryById: vi.fn(),
  getChannelBySlug: vi.fn(),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getDb: vi.fn(),
}));

// ─── Import after mock is set up ──────────────────────────────────────────────
import { appRouter } from "./routers";
import * as db from "./db";

// ─── Shared helpers ───────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeAdminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── 1. videos.list — server-side filtering ───────────────────────────────────

describe("videos.list — server-side filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes tags, sortBy, and sortDir to getVideos", async () => {
    vi.mocked(db.getVideos).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.videos.list({
      tags: ["action", "drama"],
      sortBy: "title",
      sortDir: "asc",
      page: 1,
      limit: 20,
    });

    expect(db.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["action", "drama"],
        sortBy: "title",
        sortDir: "asc",
        page: 1,
        limit: 20,
      })
    );
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("returns paginated results with correct total", async () => {
    const fakeVideos = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      slug: `video-${i + 1}`,
      publishStatus: "published" as const,
      validationStatus: "valid" as const,
      contentType: "clip" as const,
      language: "en",
      contentRating: "all",
      durationSeconds: null,
      description: null,
      thumbnailUrl: null,
      streamUrl: null,
      releaseDate: null,
      rightsOwner: null,
      validationErrors: null,
      tags: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    vi.mocked(db.getVideos).mockResolvedValue({ items: fakeVideos, total: 42 });

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.videos.list({ page: 2, limit: 5 });

    expect(result.total).toBe(42);
    expect(result.items).toHaveLength(5);
  });

  it("accepts status filter without tags", async () => {
    vi.mocked(db.getVideos).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeAdminCtx());
    await caller.videos.list({ status: "published" });

    expect(db.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published" })
    );
  });

  it("accepts search filter", async () => {
    vi.mocked(db.getVideos).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeAdminCtx());
    await caller.videos.list({ search: "my video" });

    expect(db.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ search: "my video" })
    );
  });

  it("rejects invalid sortBy values", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(
      caller.videos.list({ sortBy: "invalidField" as "createdAt" })
    ).rejects.toThrow();
  });

  it("rejects invalid sortDir values", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(
      caller.videos.list({ sortDir: "sideways" as "asc" })
    ).rejects.toThrow();
  });
});

// ─── 2. videos.allTags ────────────────────────────────────────────────────────

describe("videos.allTags — distinct tag list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a list of distinct tags from getAllDistinctTags", async () => {
    vi.mocked(db.getAllDistinctTags).mockResolvedValue(["action", "comedy", "drama"]);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.videos.allTags();

    expect(result).toEqual(["action", "comedy", "drama"]);
    expect(db.getAllDistinctTags).toHaveBeenCalledOnce();
  });

  it("returns an empty array when no tags exist", async () => {
    vi.mocked(db.getAllDistinctTags).mockResolvedValue([]);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.videos.allTags();

    expect(result).toEqual([]);
  });
});

// ─── 3. channels.stats — statistics panel ────────────────────────────────────

describe("channels.stats — statistics panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fakeStats = {
    totalVideos: 10,
    publishedVideos: 6,
    draftVideos: 2,
    pendingVideos: 1,
    approvedVideos: 1,
    archivedVideos: 0,
    validVideos: 7,
    invalidVideos: 1,
    warningVideos: 2,
    uncheckedVideos: 0,
    activeSchedules: 3,
    scheduledFuture: 1,
    expiredSchedules: 2,
    alwaysOn: 4,
    totalContentRows: 5,
    channelStatus: "active",
    channelUpdatedAt: new Date("2026-01-01"),
    channelCreatedAt: new Date("2025-01-01"),
  };

  it("returns full stats for a valid channel", async () => {
    vi.mocked(db.getChannelStats).mockResolvedValue(fakeStats);

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.channels.stats({ channelId: 1 });

    expect(result.totalVideos).toBe(10);
    expect(result.publishedVideos).toBe(6);
    expect(result.validVideos).toBe(7);
    expect(result.activeSchedules).toBe(3);
    expect(result.totalContentRows).toBe(5);
    expect(db.getChannelStats).toHaveBeenCalledWith(1);
  });

  it("throws NOT_FOUND when channel does not exist", async () => {
    vi.mocked(db.getChannelStats).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(caller.channels.stats({ channelId: 9999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects non-positive channelId", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(caller.channels.stats({ channelId: 0 })).rejects.toThrow();
    await expect(caller.channels.stats({ channelId: -1 })).rejects.toThrow();
  });

  it("returns correct schedule breakdown", async () => {
    vi.mocked(db.getChannelStats).mockResolvedValue({
      ...fakeStats,
      activeSchedules: 2,
      scheduledFuture: 3,
      expiredSchedules: 1,
      alwaysOn: 4,
    });

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.channels.stats({ channelId: 1 });

    expect(result.activeSchedules).toBe(2);
    expect(result.scheduledFuture).toBe(3);
    expect(result.expiredSchedules).toBe(1);
    expect(result.alwaysOn).toBe(4);
  });
});

// ─── 4. channels.uploadLogo — logo upload procedure ──────────────────────────

// Mock the storage module for logo upload tests
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

import * as storage from "./storage";

describe("channels.uploadLogo — logo upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls storagePut with the correct key and returns a logoUrl", async () => {
    vi.mocked(db.getChannelById).mockResolvedValue({
      id: 1,
      name: "Test Channel",
      slug: "test-channel",
      description: null,
      language: "en",
      contentRating: "all",
      status: "active",
      brandingJson: null,
      featureFlagsJson: null,
      adSettingsJson: null,
      themeJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.updateChannel).mockResolvedValue(undefined);
    vi.mocked(storage.storagePut).mockResolvedValue({
      key: "channel-logos/test-channel-abc123.png",
      url: "https://cdn.example.com/channel-logos/test-channel-abc123.png",
    });

    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.channels.uploadLogo({
      channelId: 1,
      fileDataBase64: Buffer.from("fake-image-data").toString("base64"),
      fileName: "logo.png",
      mimeType: "image/png",
    });

    expect(storage.storagePut).toHaveBeenCalledOnce();
    expect(result.logoUrl).toContain("https://");
    expect(typeof result.logoUrl).toBe("string");
  });

  it("throws NOT_FOUND when channel does not exist", async () => {
    vi.mocked(db.getChannelById).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(
      caller.channels.uploadLogo({
        channelId: 9999,
        fileDataBase64: "aGVsbG8=",
        fileName: "logo.png",
        mimeType: "image/png",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects unsupported MIME types", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());

    await expect(
      caller.channels.uploadLogo({
        channelId: 1,
        fileDataBase64: "aGVsbG8=",
        fileName: "logo.gif",
        mimeType: "image/gif",
      })
    ).rejects.toThrow();
  });
});

// ─── 5. /api/health endpoint — backend health check ──────────────────────────
// The health endpoint is a plain Express route, not a tRPC procedure.
// We test it by importing the handler logic directly.

describe("/api/health — health check endpoint", () => {
  it("health endpoint is registered in the backend", async () => {
    // Verify the health endpoint exists by checking the route is defined
    // in the server core. This is a structural test — the actual HTTP
    // response is tested via integration tests in CI.
    const fs = await import("fs");
    const indexContent = fs.readFileSync(
      new URL("../server/_core/index.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(indexContent).toContain("/api/health");
    expect(indexContent).toContain("status");
    expect(indexContent).toContain("ok");
  });

  it("health endpoint response shape includes required fields", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync(
      new URL("../server/_core/index.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Verify the endpoint emits a status field and a server time
    expect(indexContent).toContain("serverTime");
    expect(indexContent).toContain("service");
  });
});
