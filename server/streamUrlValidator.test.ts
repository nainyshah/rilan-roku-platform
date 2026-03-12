/**
 * streamUrlValidator.test.ts
 *
 * Unit tests for the stream URL validator module.
 * Uses vi.stubGlobal to mock fetch so no real HTTP requests are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkStreamUrl, checkStreamUrls } from "./streamUrlValidator";

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(status: number, contentType: string) {
  return vi.fn().mockResolvedValue({
    status,
    headers: {
      get: (header: string) =>
        header.toLowerCase() === "content-type" ? contentType : null,
    },
  });
}

function mockFetchNetworkError(message = "ECONNREFUSED") {
  return vi.fn().mockRejectedValue(new Error(message));
}

function mockFetchAbort() {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return vi.fn().mockRejectedValue(err);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkStreamUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok for a valid video/mp4 URL", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "video/mp4"));
    const result = await checkStreamUrl("https://cdn.example.com/video.mp4");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("returns ok for an HLS m3u8 manifest", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "application/vnd.apple.mpegurl"));
    const result = await checkStreamUrl("https://cdn.example.com/stream.m3u8");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("returns ok for a DASH manifest", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "application/dash+xml"));
    const result = await checkStreamUrl("https://cdn.example.com/manifest.mpd");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("returns ok with no content-type header (CDN omission)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, ""));
    const result = await checkStreamUrl("https://cdn.example.com/video.mp4");
    expect(result.status).toBe("ok");
    expect(result.isWarning).toBe(false);
  });

  it("returns ok_unknown_type for unrecognized content-type", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "application/octet-stream"));
    const result = await checkStreamUrl("https://cdn.example.com/video.bin");
    expect(result.status).toBe("ok_unknown_type");
    expect(result.isWarning).toBe(true);
  });

  it("returns bad_content for text/html (HTML page instead of video)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "text/html"));
    const result = await checkStreamUrl("https://example.com/watch");
    expect(result.status).toBe("bad_content");
    expect(result.isWarning).toBe(true);
  });

  it("returns not_found for 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, "text/html"));
    const result = await checkStreamUrl("https://cdn.example.com/missing.mp4");
    expect(result.status).toBe("not_found");
    expect(result.httpStatus).toBe(404);
    expect(result.isWarning).toBe(true);
  });

  it("returns not_found for 410 (Gone)", async () => {
    vi.stubGlobal("fetch", mockFetch(410, "text/html"));
    const result = await checkStreamUrl("https://cdn.example.com/deleted.mp4");
    expect(result.status).toBe("not_found");
    expect(result.httpStatus).toBe(410);
  });

  it("returns forbidden for 403", async () => {
    vi.stubGlobal("fetch", mockFetch(403, "text/html"));
    const result = await checkStreamUrl("https://cdn.example.com/private.mp4");
    expect(result.status).toBe("forbidden");
    expect(result.httpStatus).toBe(403);
    expect(result.isWarning).toBe(true);
  });

  it("returns forbidden for 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401, "text/html"));
    const result = await checkStreamUrl("https://cdn.example.com/auth.mp4");
    expect(result.status).toBe("forbidden");
    expect(result.httpStatus).toBe(401);
  });

  it("returns server_error for 500", async () => {
    vi.stubGlobal("fetch", mockFetch(500, "text/html"));
    const result = await checkStreamUrl("https://cdn.example.com/video.mp4");
    expect(result.status).toBe("server_error");
    expect(result.httpStatus).toBe(500);
    expect(result.isWarning).toBe(true);
  });

  it("returns timeout on AbortError", async () => {
    vi.stubGlobal("fetch", mockFetchAbort());
    const result = await checkStreamUrl("https://cdn.example.com/slow.mp4", 100);
    expect(result.status).toBe("timeout");
    expect(result.isWarning).toBe(true);
  });

  it("returns network_error on connection refused", async () => {
    vi.stubGlobal("fetch", mockFetchNetworkError("ECONNREFUSED"));
    const result = await checkStreamUrl("https://cdn.example.com/video.mp4");
    expect(result.status).toBe("network_error");
    expect(result.isWarning).toBe(true);
  });

  it("returns invalid_url for a non-HTTP URL", async () => {
    const result = await checkStreamUrl("ftp://cdn.example.com/video.mp4");
    expect(result.status).toBe("invalid_url");
    expect(result.isWarning).toBe(true);
  });

  it("returns invalid_url for a malformed URL", async () => {
    const result = await checkStreamUrl("not-a-url");
    expect(result.status).toBe("invalid_url");
    expect(result.isWarning).toBe(true);
  });

  it("falls back to GET when HEAD returns 405", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
        callCount++;
        if (opts.method === "HEAD") {
          return Promise.resolve({
            status: 405,
            headers: { get: () => null },
          });
        }
        return Promise.resolve({
          status: 200,
          headers: { get: () => "video/mp4" },
        });
      })
    );
    const result = await checkStreamUrl("https://cdn.example.com/video.mp4");
    expect(callCount).toBe(2); // HEAD + GET fallback
    expect(result.status).toBe("ok");
  });
});

describe("checkStreamUrls (batch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deduplicates URLs before checking", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: 200,
          headers: { get: () => "video/mp4" },
        });
      })
    );

    const urls = [
      "https://cdn.example.com/video.mp4",
      "https://cdn.example.com/video.mp4", // duplicate
      "https://cdn.example.com/video.mp4", // duplicate
    ];
    const results = await checkStreamUrls(urls);
    expect(callCount).toBe(1);
    expect(results.size).toBe(1);
  });

  it("returns results for all unique URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: { get: () => "video/mp4" },
        })
        .mockResolvedValueOnce({
          status: 404,
          headers: { get: () => "text/html" },
        })
    );

    const results = await checkStreamUrls([
      "https://cdn.example.com/a.mp4",
      "https://cdn.example.com/b.mp4",
    ]);

    expect(results.size).toBe(2);
    expect(results.get("https://cdn.example.com/a.mp4")?.status).toBe("ok");
    expect(results.get("https://cdn.example.com/b.mp4")?.status).toBe("not_found");
  });

  it("handles a mix of valid and broken stream URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ status: 200, headers: { get: () => "video/mp4" } })
        .mockResolvedValueOnce({ status: 404, headers: { get: () => "text/html" } })
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
    );

    const results = await checkStreamUrls([
      "https://cdn.example.com/ok.mp4",
      "https://cdn.example.com/missing.mp4",
      "https://cdn.example.com/unreachable.mp4",
    ]);

    expect(results.get("https://cdn.example.com/ok.mp4")?.isWarning).toBe(false);
    expect(results.get("https://cdn.example.com/missing.mp4")?.isWarning).toBe(true);
    expect(results.get("https://cdn.example.com/unreachable.mp4")?.isWarning).toBe(true);
  });
});
