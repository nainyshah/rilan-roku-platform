import { describe, expect, it } from "vitest";
import { generateRokuFeed } from "./feedGenerator";
import type { FeedRow, FeedVideoRow } from "./feedGenerator";
import type { Channel, Video } from "../drizzle/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 1,
    name: "Test Channel",
    slug: "test-channel",
    description: null,
    language: "en",
    contentRating: "all",
    status: "active",
    feedPath: "/api/roku/feed/test-channel.json",
    logoUrl: null,
    splashUrl: null,
    themeJson: null,
    featureFlagsJson: null,
    adSettingsJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeVideo(id: number, overrides: Partial<Video> = {}): Video {
  return {
    id,
    title: `Video ${id}`,
    slug: `video-${id}`,
    description: "A test video",
    thumbnailUrl: "https://example.com/thumb.jpg",
    streamUrl: "https://example.com/video.mp4",
    durationSeconds: 120,
    language: "en",
    contentType: "clip",
    contentRating: "all",
    releaseDate: "2024-01-01",
    rightsOwner: null,
    publishStatus: "published",
    validationStatus: "valid",
    validationErrors: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAssignment(videoId: number, overrides: {
  publishFrom?: Date | null;
  publishTo?: Date | null;
} = {}) {
  return {
    id: videoId * 100,
    channelId: 1,
    videoId,
    featuredFlag: false,
    sortOrder: 0,
    publishFrom: overrides.publishFrom ?? null,
    publishTo: overrides.publishTo ?? null,
    createdAt: new Date(),
  };
}

const EMPTY_ROWS: FeedRow[] = [];
const EMPTY_VC: { videoId: number; categoryId: number }[] = [];

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("Feed generator — publish window filtering", () => {
  it("includes videos with no publish window (always on)", () => {
    const video = makeVideo(1);
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(1), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(1);
    expect(allItems[0]?.id).toBe("video_1");
  });

  it("includes videos where now is within the publish window", () => {
    const video = makeVideo(2);
    const from = new Date(Date.now() - 60_000); // 1 min ago
    const to = new Date(Date.now() + 60_000);   // 1 min from now
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(2, { publishFrom: from, publishTo: to }), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(1);
  });

  it("excludes videos where publishFrom is in the future (not yet live)", () => {
    const video = makeVideo(3);
    const from = new Date(Date.now() + 3_600_000); // 1 hour from now
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(3, { publishFrom: from }), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(0);
  });

  it("excludes videos where publishTo is in the past (expired)", () => {
    const video = makeVideo(4);
    const to = new Date(Date.now() - 3_600_000); // 1 hour ago
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(4, { publishTo: to }), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(0);
  });

  it("includes video with only publishFrom set (in the past) and no publishTo", () => {
    const video = makeVideo(5);
    const from = new Date(Date.now() - 3_600_000); // started 1 hour ago, no end
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(5, { publishFrom: from }), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(1);
  });

  it("includes video with only publishTo set (in the future) and no publishFrom", () => {
    const video = makeVideo(6);
    const to = new Date(Date.now() + 3_600_000); // expires 1 hour from now
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(6, { publishTo: to }), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(1);
  });

  it("excludes non-published videos regardless of schedule", () => {
    const video = makeVideo(7, { publishStatus: "draft" });
    const rows: FeedVideoRow[] = [{ assignment: makeAssignment(7), video }];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    expect(allItems).toHaveLength(0);
  });

  it("handles a mix of always-on, live-window, scheduled, and expired videos", () => {
    const alwaysOn = makeVideo(10);
    const liveWindow = makeVideo(11);
    const notYetLive = makeVideo(12);
    const expired = makeVideo(13);

    const rows: FeedVideoRow[] = [
      { assignment: makeAssignment(10), video: alwaysOn },
      {
        assignment: makeAssignment(11, {
          publishFrom: new Date(Date.now() - 60_000),
          publishTo: new Date(Date.now() + 60_000),
        }),
        video: liveWindow,
      },
      {
        assignment: makeAssignment(12, { publishFrom: new Date(Date.now() + 3_600_000) }),
        video: notYetLive,
      },
      {
        assignment: makeAssignment(13, { publishTo: new Date(Date.now() - 3_600_000) }),
        video: expired,
      },
    ];

    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    const allItems = [...(feed.shortFormVideos ?? []), ...(feed.movies ?? [])];
    // Only alwaysOn (10) and liveWindow (11) should appear
    expect(allItems).toHaveLength(2);
    const ids = allItems.map((i) => i.id);
    expect(ids).toContain("video_10");
    expect(ids).toContain("video_11");
    expect(ids).not.toContain("video_12");
    expect(ids).not.toContain("video_13");
  });

  it("produces an empty feed (no playlists) when all videos are outside their windows", () => {
    const video = makeVideo(20);
    const rows: FeedVideoRow[] = [
      {
        assignment: makeAssignment(20, { publishTo: new Date(Date.now() - 1000) }),
        video,
      },
    ];
    const feed = generateRokuFeed(makeChannel(), EMPTY_ROWS, rows, EMPTY_VC);
    expect(feed.shortFormVideos ?? []).toHaveLength(0);
    expect(feed.movies ?? []).toHaveLength(0);
    expect(feed.playlists ?? []).toHaveLength(0);
  });
});
