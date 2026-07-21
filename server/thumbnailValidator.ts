/**
 * thumbnailValidator.ts
 *
 * Server-side HTTP HEAD checker for thumbnail URLs used during CSV import
 * preview. Runs checks in parallel with a configurable timeout and classifies
 * each result so the frontend can surface actionable warnings before any data
 * is written to the database.
 */

export type ThumbnailCheckStatus =
  | "ok"           // 200 OK with image content-type
  | "not_found"    // 404 or 410
  | "forbidden"    // 401 or 403
  | "redirect"     // 3xx but not followed (unusual)
  | "bad_content"  // non-image content-type returned
  | "timeout"      // request exceeded timeout
  | "network_error" // DNS failure, connection refused, etc.
  | "invalid_url"  // URL failed to parse
  | "server_error"; // 5xx

export interface ThumbnailCheckResult {
  url: string;
  status: ThumbnailCheckStatus;
  httpStatus?: number;
  contentType?: string;
  message: string;
  /** True when the check result should block import (hard error) */
  isError: boolean;
  /** True when the check result is a warning (proceed with caution) */
  isWarning: boolean;
}

const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
];

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_CONCURRENT = 10; // cap parallelism to avoid hammering remote servers

/**
 * Check a single thumbnail URL via HTTP HEAD.
 * Falls back to GET if the server returns 405 Method Not Allowed.
 */
export async function checkThumbnailUrl(
  rawUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ThumbnailCheckResult> {
  // ── Validate URL format ──────────────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        url: rawUrl,
        status: "invalid_url",
        message: `Unsupported protocol: ${parsedUrl.protocol}`,
        isError: false,
        isWarning: true,
      };
    }
  } catch {
    return {
      url: rawUrl,
      status: "invalid_url",
      message: "URL could not be parsed",
      isError: false,
      isWarning: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const attemptFetch = async (method: "HEAD" | "GET") => {
    return fetch(parsedUrl.toString(), {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "SennaVision-Roku-Platform/1.0 (thumbnail-validator)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
  };

  try {
    let response = await attemptFetch("HEAD");

    // Some servers reject HEAD — retry with GET (only fetch headers, no body)
    if (response.status === 405) {
      response = await attemptFetch("GET");
    }

    clearTimeout(timer);

    const httpStatus = response.status;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    // ── Classify by HTTP status ──────────────────────────────────────────
    if (httpStatus === 404 || httpStatus === 410) {
      return {
        url: rawUrl,
        status: "not_found",
        httpStatus,
        contentType,
        message: `Thumbnail not found (HTTP ${httpStatus})`,
        isError: false,
        isWarning: true,
      };
    }

    if (httpStatus === 401 || httpStatus === 403) {
      return {
        url: rawUrl,
        status: "forbidden",
        httpStatus,
        contentType,
        message: `Access denied (HTTP ${httpStatus}) — URL may require authentication`,
        isError: false,
        isWarning: true,
      };
    }

    if (httpStatus >= 500) {
      return {
        url: rawUrl,
        status: "server_error",
        httpStatus,
        contentType,
        message: `Remote server error (HTTP ${httpStatus})`,
        isError: false,
        isWarning: true,
      };
    }

    if (httpStatus >= 300 && httpStatus < 400) {
      // Redirects should have been followed; if we still get 3xx something is odd
      return {
        url: rawUrl,
        status: "redirect",
        httpStatus,
        contentType,
        message: `Unexpected redirect (HTTP ${httpStatus}) — check the URL`,
        isError: false,
        isWarning: true,
      };
    }

    if (httpStatus !== 200) {
      return {
        url: rawUrl,
        status: "network_error",
        httpStatus,
        contentType,
        message: `Unexpected HTTP status ${httpStatus}`,
        isError: false,
        isWarning: true,
      };
    }

    // ── Validate content-type ────────────────────────────────────────────
    // Only check content-type when the server actually returned one
    if (contentType && !IMAGE_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      return {
        url: rawUrl,
        status: "bad_content",
        httpStatus,
        contentType,
        message: `URL does not point to an image (content-type: ${contentType || "unknown"})`,
        isError: false,
        isWarning: true,
      };
    }

    return {
      url: rawUrl,
      status: "ok",
      httpStatus,
      contentType,
      message: "Thumbnail URL is reachable",
      isError: false,
      isWarning: false,
    };
  } catch (err: any) {
    clearTimeout(timer);

    if (err?.name === "AbortError" || err?.message?.includes("abort")) {
      return {
        url: rawUrl,
        status: "timeout",
        message: `Request timed out after ${timeoutMs}ms`,
        isError: false,
        isWarning: true,
      };
    }

    return {
      url: rawUrl,
      status: "network_error",
      message: `Network error: ${err?.message ?? "unknown"}`,
      isError: false,
      isWarning: true,
    };
  }
}

/**
 * Check multiple thumbnail URLs in parallel, respecting MAX_CONCURRENT.
 * Returns a Map from URL → ThumbnailCheckResult.
 */
export async function checkThumbnailUrls(
  urls: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Map<string, ThumbnailCheckResult>> {
  const results = new Map<string, ThumbnailCheckResult>();
  const unique = Array.from(new Set(urls.filter(Boolean)));

  // Process in batches to cap concurrency
  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const batch = unique.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((url) => checkThumbnailUrl(url, timeoutMs))
    );
    settled.forEach((result, idx) => {
      const url = batch[idx]!;
      if (result.status === "fulfilled") {
        results.set(url, result.value);
      } else {
        results.set(url, {
          url,
          status: "network_error",
          message: `Unexpected error: ${result.reason?.message ?? "unknown"}`,
          isError: false,
          isWarning: true,
        });
      }
    });
  }

  return results;
}
