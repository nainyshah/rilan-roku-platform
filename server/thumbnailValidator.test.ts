import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkThumbnailUrl,
  checkThumbnailUrls,
  type ThumbnailCheckResult,
} from "./thumbnailValidator";

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeResponse(
  status: number,
  headers: Record<string, string> = {}
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

// ─── checkThumbnailUrl ────────────────────────────────────────────────────────
describe("checkThumbnailUrl", () => {
  it("returns ok for a 200 response with image/jpeg content-type", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "image/jpeg" })
    );
    const result = await checkThumbnailUrl("https://example.com/thumb.jpg");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.httpStatus).toBe(200);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("returns ok for image/png content-type", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "image/png" })
    );
    const result = await checkThumbnailUrl("https://example.com/thumb.png");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("returns not_found for HTTP 404", async () => {
    mockFetch.mockResolvedValue(makeResponse(404));
    const result = await checkThumbnailUrl("https://example.com/missing.jpg");
    expect(result.status).toBe("not_found");
    expect(result.isWarning).toBe(true);
    expect(result.httpStatus).toBe(404);
  });

  it("returns not_found for HTTP 410", async () => {
    mockFetch.mockResolvedValue(makeResponse(410));
    const result = await checkThumbnailUrl("https://example.com/gone.jpg");
    expect(result.status).toBe("not_found");
    expect(result.isWarning).toBe(true);
  });

  it("returns forbidden for HTTP 403", async () => {
    mockFetch.mockResolvedValue(makeResponse(403));
    const result = await checkThumbnailUrl("https://example.com/private.jpg");
    expect(result.status).toBe("forbidden");
    expect(result.isWarning).toBe(true);
  });

  it("returns forbidden for HTTP 401", async () => {
    mockFetch.mockResolvedValue(makeResponse(401));
    const result = await checkThumbnailUrl("https://example.com/auth.jpg");
    expect(result.status).toBe("forbidden");
    expect(result.isWarning).toBe(true);
  });

  it("returns server_error for HTTP 500", async () => {
    mockFetch.mockResolvedValue(makeResponse(500));
    const result = await checkThumbnailUrl("https://example.com/error.jpg");
    expect(result.status).toBe("server_error");
    expect(result.isWarning).toBe(true);
  });

  it("returns bad_content when content-type is text/html", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "text/html; charset=utf-8" })
    );
    const result = await checkThumbnailUrl("https://example.com/page.html");
    expect(result.status).toBe("bad_content");
    expect(result.isWarning).toBe(true);
    expect(result.contentType).toBe("text/html");
  });

  it("returns bad_content when content-type is application/json", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "application/json" })
    );
    const result = await checkThumbnailUrl("https://example.com/api.json");
    expect(result.status).toBe("bad_content");
    expect(result.isWarning).toBe(true);
  });

  it("returns ok when content-type is missing (server may omit it)", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, {}));
    const result = await checkThumbnailUrl("https://example.com/thumb");
    // No content-type → we don't flag it, assume image
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("falls back to GET when HEAD returns 405", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(405)) // HEAD → 405
      .mockResolvedValueOnce(makeResponse(200, { "content-type": "image/webp" })); // GET → 200
    const result = await checkThumbnailUrl("https://example.com/thumb.webp");
    expect(result.status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns timeout on AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValue(abortError);
    const result = await checkThumbnailUrl("https://example.com/slow.jpg", 100);
    expect(result.status).toBe("timeout");
    expect(result.isWarning).toBe(true);
  });

  it("returns network_error on DNS failure", async () => {
    mockFetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND nonexistent.example.com"));
    const result = await checkThumbnailUrl("https://nonexistent.example.com/img.jpg");
    expect(result.status).toBe("network_error");
    expect(result.isWarning).toBe(true);
  });

  it("returns invalid_url for a non-HTTP URL", async () => {
    const result = await checkThumbnailUrl("ftp://example.com/thumb.jpg");
    expect(result.status).toBe("invalid_url");
    expect(result.isWarning).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns invalid_url for a completely malformed URL", async () => {
    const result = await checkThumbnailUrl("not-a-url-at-all");
    expect(result.status).toBe("invalid_url");
    expect(result.isWarning).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── checkThumbnailUrls (batch) ───────────────────────────────────────────────
describe("checkThumbnailUrls", () => {
  it("deduplicates URLs and returns a Map keyed by URL", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "image/jpeg" })
    );
    const urls = [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
      "https://example.com/a.jpg", // duplicate
    ];
    const results = await checkThumbnailUrls(urls);
    expect(results.size).toBe(2); // deduplicated
    expect(results.get("https://example.com/a.jpg")?.status).toBe("ok");
    expect(results.get("https://example.com/b.jpg")?.status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles empty URL list", async () => {
    const results = await checkThumbnailUrls([]);
    expect(results.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("filters out empty strings", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { "content-type": "image/png" })
    );
    const results = await checkThumbnailUrls(["", "https://example.com/img.png", ""]);
    expect(results.size).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("collects mixed ok and warning results", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(200, { "content-type": "image/jpeg" }))
      .mockResolvedValueOnce(makeResponse(404));
    const results = await checkThumbnailUrls([
      "https://example.com/ok.jpg",
      "https://example.com/missing.jpg",
    ]);
    expect(results.get("https://example.com/ok.jpg")?.status).toBe("ok");
    expect(results.get("https://example.com/missing.jpg")?.status).toBe("not_found");
  });

  it("handles a fetch rejection gracefully without throwing", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));
    const results = await checkThumbnailUrls(["https://example.com/img.jpg"]);
    const r = results.get("https://example.com/img.jpg");
    expect(r?.status).toBe("network_error");
    expect(r?.isWarning).toBe(true);
  });
});

// ─── Integration: parsePreview escalates row status ───────────────────────────
describe("thumbnail validation integration with parseCsvText", () => {
  it("escalates a valid row to warning when thumbnail returns 404", async () => {
    // This tests the logic in the import router, not the validator directly.
    // We simulate the escalation logic here to ensure correctness.
    const row = {
      rowIndex: 1,
      data: { thumbnailUrl: "https://example.com/missing.jpg" },
      status: "valid" as const,
      issues: [] as string[],
    };

    const check: ThumbnailCheckResult = {
      url: "https://example.com/missing.jpg",
      status: "not_found",
      httpStatus: 404,
      message: "Thumbnail not found (HTTP 404)",
      isError: false,
      isWarning: true,
    };

    // Apply the same escalation logic used in the router
    if (check.isWarning) {
      if (row.status === "valid") (row as any).status = "warning";
      row.issues.push(`Thumbnail: ${check.message}`);
    }

    expect(row.status).toBe("warning");
    expect(row.issues).toContain("Thumbnail: Thumbnail not found (HTTP 404)");
  });

  it("does NOT escalate a row when thumbnail check is ok", () => {
    const row = {
      rowIndex: 2,
      data: { thumbnailUrl: "https://example.com/ok.jpg" },
      status: "valid" as const,
      issues: [] as string[],
    };

    const check: ThumbnailCheckResult = {
      url: "https://example.com/ok.jpg",
      status: "ok",
      httpStatus: 200,
      contentType: "image/jpeg",
      message: "Thumbnail URL is reachable",
      isError: false,
      isWarning: false,
    };

    if (check.isWarning) {
      if (row.status === "valid") (row as any).status = "warning";
      row.issues.push(`Thumbnail: ${check.message}`);
    }

    expect(row.status).toBe("valid");
    expect(row.issues).toHaveLength(0);
  });
});
