import { describe, expect, it, vi, beforeEach } from "vitest";
import { importRouter } from "./routers/import";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(),
    getVideoBySlug: vi.fn().mockResolvedValue(null),
    getChannelBySlug: vi.fn().mockResolvedValue(null),
    getCategoryBySlug: vi.fn().mockResolvedValue(null),
    createVideo: vi.fn().mockResolvedValue(undefined),
    assignVideoToChannel: vi.fn().mockResolvedValue(undefined),
    setVideoCategories: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Mock storage ─────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "import-logs/test.csv", url: "https://s3.example.com/test.csv" }),
  storageGet: vi.fn().mockResolvedValue({ key: "import-logs/test.csv", url: "https://s3.example.com/test.csv" }),
}));

// ─── Admin context ────────────────────────────────────────────────────────────
function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@rilan.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Sample CSV ───────────────────────────────────────────────────────────────
const SAMPLE_CSV = `title,description,thumbnailUrl,streamUrl,durationSeconds,contentType
Test Video 1,A test video,https://example.com/thumb1.jpg,https://example.com/v1.mp4,120,clip
Test Video 2,Another test,https://example.com/thumb2.jpg,https://example.com/v2.mp4,240,movie`;

describe("import.getReimportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when log ID does not exist", async () => {
    const { getDb } = await import("./db");
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // empty = not found
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = importRouter.createCaller(makeAdminCtx());
    await expect(caller.getReimportData({ id: 9999 })).rejects.toThrow("Import log not found");
  });

  it("throws PRECONDITION_FAILED when log has no CSV stored", async () => {
    const { getDb } = await import("./db");
    const logWithNoCsv = {
      id: 1,
      filename: "no-csv.csv",
      csvS3Key: null,
      csvUrl: null,
      totalRows: 5,
      importedCount: 5,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      defaultChannelSlug: null,
      defaultCategorySlug: null,
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([logWithNoCsv]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const caller = importRouter.createCaller(makeAdminCtx());
    await expect(caller.getReimportData({ id: 1 })).rejects.toThrow(
      "No CSV file was stored for this import"
    );
  });

  it("returns CSV text and metadata when log has csvUrl", async () => {
    const { getDb } = await import("./db");
    const { storageGet } = await import("./storage");

    const logWithCsv = {
      id: 2,
      filename: "my-import.csv",
      csvS3Key: "import-logs/my-import.csv",
      csvUrl: "https://s3.example.com/my-import.csv",
      totalRows: 2,
      importedCount: 2,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      defaultChannelSlug: "shorts-tv",
      defaultCategorySlug: "featured",
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([logWithCsv]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    vi.mocked(storageGet).mockResolvedValue({
      key: "import-logs/my-import.csv",
      url: "https://s3.example.com/my-import.csv",
    });

    // Mock the fetch call that retrieves CSV bytes
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(SAMPLE_CSV),
    } as any);

    const caller = importRouter.createCaller(makeAdminCtx());
    const result = await caller.getReimportData({ id: 2 });

    expect(result.logId).toBe(2);
    expect(result.filename).toBe("my-import.csv");
    expect(result.csvText).toBe(SAMPLE_CSV);
    expect(result.defaultChannelSlug).toBe("shorts-tv");
    expect(result.defaultCategorySlug).toBe("featured");
    expect(result.originalStats.totalRows).toBe(2);
    expect(result.originalStats.importedCount).toBe(2);
  });

  it("falls back to csvUrl when storageGet throws", async () => {
    const { getDb } = await import("./db");
    const { storageGet } = await import("./storage");

    const logWithCsv = {
      id: 3,
      filename: "fallback.csv",
      csvS3Key: "import-logs/fallback.csv",
      csvUrl: "https://s3.example.com/fallback.csv",
      totalRows: 1,
      importedCount: 1,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      defaultChannelSlug: null,
      defaultCategorySlug: null,
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([logWithCsv]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    vi.mocked(storageGet).mockRejectedValue(new Error("S3 error"));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("title\nFallback Video"),
    } as any);

    const caller = importRouter.createCaller(makeAdminCtx());
    const result = await caller.getReimportData({ id: 3 });

    expect(result.csvText).toBe("title\nFallback Video");
    // Should have used the fallback csvUrl
    expect(global.fetch).toHaveBeenCalledWith("https://s3.example.com/fallback.csv");
  });

  it("throws INTERNAL_SERVER_ERROR when S3 fetch returns non-OK status", async () => {
    const { getDb } = await import("./db");
    const { storageGet } = await import("./storage");

    const logWithCsv = {
      id: 4,
      filename: "bad-fetch.csv",
      csvS3Key: "import-logs/bad-fetch.csv",
      csvUrl: "https://s3.example.com/bad-fetch.csv",
      totalRows: 0,
      importedCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      defaultChannelSlug: null,
      defaultCategorySlug: null,
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([logWithCsv]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    vi.mocked(storageGet).mockResolvedValue({
      key: "import-logs/bad-fetch.csv",
      url: "https://s3.example.com/bad-fetch.csv",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    } as any);

    const caller = importRouter.createCaller(makeAdminCtx());
    await expect(caller.getReimportData({ id: 4 })).rejects.toThrow(
      "Failed to fetch CSV from storage (HTTP 403)"
    );
  });
});
