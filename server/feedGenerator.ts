import type { Channel, Video } from "../drizzle/schema";

// ─── Roku Direct Publisher Feed Types ─────────────────────────────────────────
export interface RokuFeedItem {
  id: string;
  title: string;
  content: {
    dateAdded: string;
    videos: Array<{
      url: string;
      quality: string;
      videoType: string;
    }>;
    duration: number;
    captions?: Array<{ url: string; language: string; captionType: string }>;
    language: string;
  };
  thumbnail: string;
  releaseDate: string;
  shortDescription: string;
  longDescription?: string;
  tags?: string[];
  rating?: { rating: string; ratingSource: string };
  genres?: string[];
}

export interface RokuFeedCategory {
  name: string;
  playlistName?: string;
  query?: string;
  order?: string;
}

export interface RokuDirectPublisherFeed {
  providerName: string;
  lastUpdated: string;
  language: string;
  rating?: string;
  movies?: RokuFeedItem[];
  series?: unknown[];
  shortFormVideos?: RokuFeedItem[];
  tvSpecials?: RokuFeedItem[];
  categories?: RokuFeedCategory[];
  playlists?: Array<{ name: string; itemIds: string[] }>;
}

// ─── Validation ────────────────────────────────────────────────────────────────
export interface ValidationResult {
  videoId: number;
  title: string;
  status: "valid" | "warning" | "error";
  issues: string[];
}

export function validateVideo(video: Video): ValidationResult {
  const issues: string[] = [];

  if (!video.title || video.title.trim().length === 0) issues.push("Missing title");
  if (!video.thumbnailUrl) issues.push("Missing thumbnail URL");
  if (!video.streamUrl) issues.push("Missing stream URL");
  if (!video.durationSeconds || video.durationSeconds <= 0) issues.push("Invalid or missing duration");
  if (!video.description || video.description.trim().length === 0) issues.push("Missing description (recommended)");
  if (!video.releaseDate) issues.push("Missing release date (recommended)");

  const errorIssues = issues.filter((i) => ["Missing title", "Missing thumbnail URL", "Missing stream URL", "Invalid or missing duration"].includes(i));
  const warnIssues = issues.filter((i) => !errorIssues.includes(i));

  let status: "valid" | "warning" | "error" = "valid";
  if (errorIssues.length > 0) status = "error";
  else if (warnIssues.length > 0) status = "warning";

  return { videoId: video.id, title: video.title, status, issues };
}

// ─── Feed Item Builder ─────────────────────────────────────────────────────────
function buildFeedItem(video: Video): RokuFeedItem {
  const videoType = inferVideoType(video.streamUrl ?? "");
  const quality = "HD";

  const item: RokuFeedItem = {
    id: `video_${video.id}`,
    title: video.title,
    content: {
      dateAdded: video.createdAt ? new Date(video.createdAt).toISOString() : new Date().toISOString(),
      videos: [
        {
          url: video.streamUrl!,
          quality,
          videoType,
        },
      ],
      duration: video.durationSeconds ?? 0,
      language: video.language ?? "en",
    },
    thumbnail: video.thumbnailUrl!,
    releaseDate: video.releaseDate ?? new Date().toISOString().split("T")[0]!,
    shortDescription: video.description?.substring(0, 200) ?? video.title,
    longDescription: video.description ?? undefined,
    tags: Array.isArray(video.tags) ? (video.tags as string[]) : [],
  };

  if (video.contentRating) {
    item.rating = {
      rating: mapContentRating(video.contentRating),
      ratingSource: "USA_PR",
    };
  }

  return item;
}

function inferVideoType(url: string): string {
  if (url.includes(".m3u8")) return "HLS";
  if (url.includes(".mpd")) return "DASH";
  if (url.includes(".mp4")) return "MP4";
  if (url.includes(".mov")) return "MOV";
  return "MP4";
}

function mapContentRating(rating: string): string {
  const map: Record<string, string> = {
    all: "G",
    kids: "G",
    "pg-13": "PG-13",
    pg: "PG",
    r: "R",
    "nc-17": "NC-17",
    tv14: "TV-14",
    tvma: "TV-MA",
    tvg: "TV-G",
    tvpg: "TV-PG",
    tvy: "TV-Y",
    "tvy-7": "TV-Y7",
  };
  return map[rating.toLowerCase()] ?? "NR";
}

// ─── Main Feed Generator ───────────────────────────────────────────────────────
export interface FeedRow {
  row: {
    id: number;
    channelId: number;
    categoryId: number;
    rowTitle: string | null;
    rowOrder: number | null;
    isVisible: boolean;
    createdAt: Date;
  };
  category: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface FeedVideoRow {
  assignment: {
    id: number;
    channelId: number;
    videoId: number;
    featuredFlag: boolean | null;
    sortOrder: number | null;
    publishFrom: Date | null;
    publishTo: Date | null;
    createdAt: Date;
  };
  video: Video;
}

export function generateRokuFeed(
  channel: Channel,
  rows: FeedRow[],
  channelVideoRows: FeedVideoRow[],
  vcMappings: { videoId: number; categoryId: number }[]
): RokuDirectPublisherFeed {
  const now = new Date();

  // Filter videos by publish window and status
  const activeVideos = channelVideoRows.filter((r) => {
    if (r.video.publishStatus !== "published") return false;
    const { publishFrom, publishTo } = r.assignment;
    if (publishFrom && now < publishFrom) return false;
    if (publishTo && now > publishTo) return false;
    return true;
  });

  // Build video lookup
  const videoMap = new Map<number, Video>(activeVideos.map((r) => [r.video.id, r.video]));

  // Build category → video mapping
  const categoryVideoMap = new Map<number, number[]>();
  for (const vc of vcMappings) {
    if (!videoMap.has(vc.videoId)) continue;
    if (!categoryVideoMap.has(vc.categoryId)) categoryVideoMap.set(vc.categoryId, []);
    categoryVideoMap.get(vc.categoryId)!.push(vc.videoId);
  }

  // Build playlists per row
  const playlists: Array<{ name: string; itemIds: string[] }> = [];
  const feedCategories: RokuFeedCategory[] = [];

  for (const row of rows) {
    const catId = row.category.id;
    const rowTitle = row.row.rowTitle ?? row.category.name;
    const videoIds = categoryVideoMap.get(catId) ?? [];

    // Also include videos not in any category (assigned to channel but no category)
    if (videoIds.length === 0) continue;

    const itemIds = videoIds.map((id) => `video_${id}`);
    playlists.push({ name: rowTitle, itemIds });
    feedCategories.push({ name: rowTitle, playlistName: rowTitle, order: "manual" });
  }

  // If no rows, add a default "All Videos" playlist
  if (playlists.length === 0 && activeVideos.length > 0) {
    const allIds = activeVideos.map((r) => `video_${r.video.id}`);
    playlists.push({ name: "All Videos", itemIds: allIds });
    feedCategories.push({ name: "All Videos", playlistName: "All Videos", order: "manual" });
  }

  // Separate short-form vs long-form
  const shortFormVideos: RokuFeedItem[] = [];
  const movies: RokuFeedItem[] = [];

  for (const [, video] of Array.from(videoMap)) {
    const item = buildFeedItem(video);
    const duration = video.durationSeconds ?? 0;
    if (video.contentType === "movie" || video.contentType === "series" || video.contentType === "special") {
      movies.push(item);
    } else if (duration < 600 || video.contentType === "short" || video.contentType === "clip" || video.contentType === "episode") {
      shortFormVideos.push(item);
    } else {
      shortFormVideos.push(item);
    }
  }

  const feed: RokuDirectPublisherFeed = {
    providerName: channel.name,
    lastUpdated: now.toISOString(),
    language: channel.language ?? "en",
    categories: feedCategories.length > 0 ? feedCategories : undefined,
    playlists: playlists.length > 0 ? playlists : undefined,
  };

  if (shortFormVideos.length > 0) feed.shortFormVideos = shortFormVideos;
  if (movies.length > 0) feed.movies = movies;

  return feed;
}

// ─── Feed Validation Report ────────────────────────────────────────────────────
export interface FeedValidationReport {
  channelSlug: string;
  channelName: string;
  isChannelActive: boolean;
  totalVideosInChannel: number;
  validVideos: number;
  invalidVideos: number;
  warnings: number;
  emptyRows: string[];
  videoResults: ValidationResult[];
  feedReady: boolean;
}

export function generateValidationReport(
  channel: Channel,
  rows: FeedRow[],
  channelVideoRows: FeedVideoRow[],
  vcMappings: { videoId: number; categoryId: number }[]
): FeedValidationReport {
  const videoResults = channelVideoRows.map((r) => validateVideo(r.video));
  const validVideos = videoResults.filter((r) => r.status === "valid").length;
  const invalidVideos = videoResults.filter((r) => r.status === "error").length;
  const warnings = videoResults.filter((r) => r.status === "warning").length;

  const categoryVideoMap = new Map<number, number[]>();
  for (const vc of vcMappings) {
    if (!categoryVideoMap.has(vc.categoryId)) categoryVideoMap.set(vc.categoryId, []);
    categoryVideoMap.get(vc.categoryId)!.push(vc.videoId);
  }

  const emptyRows = rows
    .filter((r) => {
      const ids = categoryVideoMap.get(r.category.id) ?? [];
      return ids.length === 0;
    })
    .map((r) => r.row.rowTitle ?? r.category.name);

  return {
    channelSlug: channel.slug,
    channelName: channel.name,
    isChannelActive: channel.status === "active",
    totalVideosInChannel: channelVideoRows.length,
    validVideos,
    invalidVideos,
    warnings,
    emptyRows,
    videoResults,
    feedReady: channel.status === "active" && invalidVideos === 0 && validVideos > 0,
  };
}
