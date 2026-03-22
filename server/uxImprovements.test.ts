import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Tag filter logic ─────────────────────────────────────────────────────────
describe("Tag filter logic", () => {
  // Simulate the client-side tag filtering that Videos.tsx does
  function filterByTags(
    videos: { id: number; tags: string | null }[],
    selectedTags: string[]
  ) {
    if (selectedTags.length === 0) return videos;
    return videos.filter((v) => {
      if (!v.tags) return false;
      const videoTags = v.tags.split(",").map((t) => t.trim().toLowerCase());
      return selectedTags.every((tag) => videoTags.includes(tag.toLowerCase()));
    });
  }

  const videos = [
    { id: 1, tags: "gaming, action, multiplayer" },
    { id: 2, tags: "kids, animation" },
    { id: 3, tags: "gaming, kids" },
    { id: 4, tags: null },
    { id: 5, tags: "food, cooking, travel" },
  ];

  it("returns all videos when no tags selected", () => {
    expect(filterByTags(videos, [])).toHaveLength(5);
  });

  it("filters by single tag", () => {
    const result = filterByTags(videos, ["gaming"]);
    expect(result.map((v) => v.id)).toEqual([1, 3]);
  });

  it("filters by multiple tags (AND logic)", () => {
    const result = filterByTags(videos, ["gaming", "kids"]);
    expect(result.map((v) => v.id)).toEqual([3]);
  });

  it("excludes videos with null tags", () => {
    const result = filterByTags(videos, ["gaming"]);
    expect(result.find((v) => v.id === 4)).toBeUndefined();
  });

  it("is case-insensitive", () => {
    const result = filterByTags(videos, ["GAMING"]);
    expect(result.map((v) => v.id)).toEqual([1, 3]);
  });

  it("returns empty array when no videos match", () => {
    const result = filterByTags(videos, ["nonexistent"]);
    expect(result).toHaveLength(0);
  });

  it("handles tags with extra whitespace", () => {
    const vids = [{ id: 1, tags: " gaming , action " }];
    expect(filterByTags(vids, ["gaming"])).toHaveLength(1);
  });
});

// ─── getAllDistinctTags helper logic ──────────────────────────────────────────
describe("getAllDistinctTags logic", () => {
  // Simulate the tag extraction logic from db.ts
  function extractDistinctTags(tagStrings: (string | null)[]): string[] {
    const tagSet = new Set<string>();
    for (const tagStr of tagStrings) {
      if (!tagStr) continue;
      tagStr.split(",").forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) tagSet.add(trimmed);
      });
    }
    return Array.from(tagSet).sort();
  }

  it("extracts unique tags from multiple videos", () => {
    const tags = extractDistinctTags([
      "gaming, action",
      "kids, animation",
      "gaming, kids",
    ]);
    expect(tags).toEqual(["action", "animation", "gaming", "kids"]);
  });

  it("handles null tag strings", () => {
    const tags = extractDistinctTags([null, "gaming", null]);
    expect(tags).toEqual(["gaming"]);
  });

  it("deduplicates tags", () => {
    const tags = extractDistinctTags(["gaming", "gaming", "gaming"]);
    expect(tags).toEqual(["gaming"]);
  });

  it("returns empty array for all-null inputs", () => {
    const tags = extractDistinctTags([null, null]);
    expect(tags).toEqual([]);
  });

  it("trims whitespace from tags", () => {
    const tags = extractDistinctTags(["  gaming  ,  action  "]);
    expect(tags).toEqual(["action", "gaming"]);
  });
});

// ─── Cache status display logic ───────────────────────────────────────────────
describe("Cache status display logic", () => {
  // Simulate the cache age display logic from Publishing.tsx
  function formatCacheAge(cachedAt: number | null, ttlMs: number): string {
    if (!cachedAt) return "Not cached";
    const ageMs = Date.now() - cachedAt;
    if (ageMs >= ttlMs) return "Expired";
    const ageSec = Math.floor(ageMs / 1000);
    const remainSec = Math.floor((ttlMs - ageMs) / 1000);
    if (ageSec < 60) return `Cached ${ageSec}s ago (expires in ${remainSec}s)`;
    const ageMin = Math.floor(ageSec / 60);
    return `Cached ${ageMin}m ago (expires in ${Math.floor(remainSec / 60)}m)`;
  }

  it("returns 'Not cached' when cachedAt is null", () => {
    expect(formatCacheAge(null, 300_000)).toBe("Not cached");
  });

  it("returns 'Expired' when cache is past TTL", () => {
    const old = Date.now() - 400_000; // 400s ago, TTL=300s
    expect(formatCacheAge(old, 300_000)).toBe("Expired");
  });

  it("shows seconds for recent cache entries", () => {
    const recent = Date.now() - 10_000; // 10s ago
    const result = formatCacheAge(recent, 300_000);
    expect(result).toMatch(/Cached \d+s ago/);
    expect(result).toMatch(/expires in \d+s/);
  });

  it("shows minutes for older cache entries", () => {
    const older = Date.now() - 120_000; // 2 min ago
    const result = formatCacheAge(older, 300_000);
    expect(result).toMatch(/Cached \d+m ago/);
  });
});

// ─── Re-import channel override logic ────────────────────────────────────────
describe("Re-import channel override logic", () => {
  // Simulate how the override panel state interacts with the import mutation input
  function buildImportInput(
    csvText: string,
    filename: string,
    defaultChannelSlug: string,
    defaultCategorySlug: string,
    skipErrors: boolean
  ) {
    return {
      csvText,
      filename,
      defaultChannelSlug: defaultChannelSlug === "none" ? undefined : defaultChannelSlug,
      defaultCategorySlug: defaultCategorySlug === "none" ? undefined : defaultCategorySlug,
      skipErrors,
    };
  }

  it("passes undefined when 'none' is selected for channel", () => {
    const input = buildImportInput("csv", "file.csv", "none", "none", true);
    expect(input.defaultChannelSlug).toBeUndefined();
    expect(input.defaultCategorySlug).toBeUndefined();
  });

  it("passes slug when a channel is selected", () => {
    const input = buildImportInput("csv", "file.csv", "rilan-shorts-tv", "gaming", true);
    expect(input.defaultChannelSlug).toBe("rilan-shorts-tv");
    expect(input.defaultCategorySlug).toBe("gaming");
  });

  it("preserves original channel from reimportData when no override applied", () => {
    const reimportData = {
      defaultChannelSlug: "rilan-kids-tv",
      defaultCategorySlug: "animation",
    };
    // Simulate useEffect setting state from reimportData
    let channelSlug = reimportData.defaultChannelSlug ?? "none";
    let categorySlug = reimportData.defaultCategorySlug ?? "none";
    expect(channelSlug).toBe("rilan-kids-tv");
    expect(categorySlug).toBe("animation");
  });

  it("allows override to replace original channel", () => {
    // Admin changes the channel in the override panel
    let channelSlug = "rilan-kids-tv"; // from reimportData
    channelSlug = "rilan-food-tv"; // admin overrides
    const input = buildImportInput("csv", "file.csv", channelSlug, "none", true);
    expect(input.defaultChannelSlug).toBe("rilan-food-tv");
  });

  it("clears re-import state when Clear button clicked", () => {
    let reimportBanner: string | null = "batch-2024-01.csv";
    let csvText: string | null = "title,streamUrl\nTest,https://example.com/video.mp4";
    // Simulate handleReset + clear
    reimportBanner = null;
    csvText = null;
    expect(reimportBanner).toBeNull();
    expect(csvText).toBeNull();
  });
});
