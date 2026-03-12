/**
 * streamUrlValidator.ts
 *
 * Server-side HTTP HEAD checker for video stream URLs used during CSV import
 * preview. Validates that stream URLs are reachable and return appropriate
 * content types before any data is written to the database.
 *
 * Unlike thumbnail validation (which checks for image content-types), stream
 * URL validation accepts video content-types, HLS/DASH manifests, and also
 * allows unknown content-types (many CDNs serve video without proper headers).
 */

export type StreamCheckStatus =
  | "ok"             // 200 OK (video/manifest content-type, or unknown but reachable)
  | "ok_unknown_type" // 200 OK but content-type is unrecognized (warn, don't block)
  | "not_found"      // 404 or 410
  | "forbidden"      // 401 or 403
  | "redirect"       // unexpected 3xx
  | "bad_content"    // clearly non-video content-type (e.g., text/html)
  | "timeout"        // request exceeded timeout
  | "network_error"  // DNS failure, connection refused, etc.
  | "invalid_url"    // URL failed to parse
  | "server_error";  // 5xx

export interface StreamCheckResult {
  url: string;
  status: StreamCheckStatus;
  httpStatus?: number;
  contentType?: string;
  message: string;
  /** True when the check result is a warning (proceed with caution) */
  isWarning: boolean;
}

/** Video MIME types that are definitively valid */
const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/x-msvideo",
  "video/quicktime",
  "video/x-matroska",
  "video/3gpp",
  "video/x-flv",
  "video/mpeg",
];

/** HLS / DASH / smooth streaming manifest types */
const MANIFEST_CONTENT_TYPES = [
  "application/vnd.apple.mpegurl",   // HLS .m3u8
  "application/x-mpegurl",           // HLS alternate
  "application/dash+xml",            // MPEG-DASH .mpd
  "application/vnd.ms-sstr+xml",     // Smooth Streaming
  "text/vnd.trolltech.linguist",     // Some CDNs serve m3u8 as this
];

/** Content-types that are clearly NOT video */
const BLOCKED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/xml",
  "application/json",
  "text/plain",
  "application/javascript",
  "text/css",
  "image/",  // prefix match
];

const DEFAULT_TIMEOUT_MS = 7000; // slightly longer than thumbnail — streams can be slow
const MAX_CONCURRENT = 8;

function isVideoContentType(ct: string): boolean {
  return VIDEO_CONTENT_TYPES.some((t) => ct.startsWith(t)) ||
    MANIFEST_CONTENT_TYPES.some((t) => ct.startsWith(t));
}

function isBlockedContentType(ct: string): boolean {
  return BLOCKED_CONTENT_TYPES.some((t) => ct.startsWith(t));
}

/**
 * Check a single stream URL via HTTP HEAD.
 * Falls back to GET if the server returns 405 Method Not Allowed.
 */
export async function checkStreamUrl(
  rawUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<StreamCheckResult> {
  // ── Validate URL format ────────────────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        url: rawUrl,
        status: "invalid_url",
        message: `Unsupported protocol: ${parsedUrl.protocol}`,
        isWarning: true,
      };
    }
  } catch {
    return {
      url: rawUrl,
      status: "invalid_url",
      message: "Stream URL could not be parsed",
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
        "User-Agent": "RILAN-Roku-Platform/1.0 (stream-validator)",
        Accept: "video/*,application/vnd.apple.mpegurl,application/dash+xml,*/*;q=0.5",
      },
    });
  };

  try {
    let response = await attemptFetch("HEAD");

    // Some CDNs reject HEAD on video files — retry with GET (headers only)
    if (response.status === 405) {
      response = await attemptFetch("GET");
    }

    clearTimeout(timer);

    const httpStatus = response.status;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    // ── Classify by HTTP status ────────────────────────────────────────────
    if (httpStatus === 404 || httpStatus === 410) {
      return {
        url: rawUrl,
        status: "not_found",
        httpStatus,
        contentType,
        message: `Stream URL not found (HTTP ${httpStatus})`,
        isWarning: true,
      };
    }

    if (httpStatus === 401 || httpStatus === 403) {
      return {
        url: rawUrl,
        status: "forbidden",
        httpStatus,
        contentType,
        message: `Access denied (HTTP ${httpStatus}) — URL may require authentication or be geo-restricted`,
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
        isWarning: true,
      };
    }

    if (httpStatus >= 300 && httpStatus < 400) {
      return {
        url: rawUrl,
        status: "redirect",
        httpStatus,
        contentType,
        message: `Unexpected redirect (HTTP ${httpStatus}) — check the URL`,
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
        isWarning: true,
      };
    }

    // ── Validate content-type ──────────────────────────────────────────────
    // If no content-type returned, treat as OK (many CDNs omit it for video)
    if (!contentType) {
      return {
        url: rawUrl,
        status: "ok",
        httpStatus,
        contentType: "",
        message: "Stream URL is reachable (no content-type header)",
        isWarning: false,
      };
    }

    if (isVideoContentType(contentType)) {
      return {
        url: rawUrl,
        status: "ok",
        httpStatus,
        contentType,
        message: "Stream URL is reachable",
        isWarning: false,
      };
    }

    if (isBlockedContentType(contentType)) {
      return {
        url: rawUrl,
        status: "bad_content",
        httpStatus,
        contentType,
        message: `URL does not appear to be a video stream (content-type: ${contentType})`,
        isWarning: true,
      };
    }

    // Unknown content-type but reachable — warn but don't block
    return {
      url: rawUrl,
      status: "ok_unknown_type",
      httpStatus,
      contentType,
      message: `Stream URL is reachable but content-type "${contentType}" is unrecognized — verify it is a valid video stream`,
      isWarning: true,
    };
  } catch (err: any) {
    clearTimeout(timer);

    if (err?.name === "AbortError" || err?.message?.includes("abort")) {
      return {
        url: rawUrl,
        status: "timeout",
        message: `Request timed out after ${timeoutMs}ms`,
        isWarning: true,
      };
    }

    return {
      url: rawUrl,
      status: "network_error",
      message: `Network error: ${err?.message ?? "unknown"}`,
      isWarning: true,
    };
  }
}

/**
 * Check multiple stream URLs in parallel, respecting MAX_CONCURRENT.
 * Returns a Map from URL → StreamCheckResult.
 */
export async function checkStreamUrls(
  urls: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Map<string, StreamCheckResult>> {
  const results = new Map<string, StreamCheckResult>();
  const unique = Array.from(new Set(urls.filter(Boolean)));

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const batch = unique.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((url) => checkStreamUrl(url, timeoutMs))
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
          isWarning: true,
        });
      }
    });
  }

  return results;
}
