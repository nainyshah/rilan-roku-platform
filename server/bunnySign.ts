import { createHash } from "crypto";

const GUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

function urlSafe(b64: string): string {
  return b64.replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function extractBunnyGuid(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(GUID_RE);
  return m ? m[0] : null;
}

export function bunnyHostFrom(thumbnailUrl?: string | null, fallback?: string | null): string | null {
  if (thumbnailUrl) {
    try {
      const u = new URL(thumbnailUrl);
      if (u.hostname.endsWith("b-cdn.net")) return u.hostname;
    } catch { /* ignore */ }
  }
  return fallback ?? null;
}

export function signBunnyHls(p: { host: string; guid: string; securityKey: string; ttlSeconds?: number; file?: string; }): string {
  const file = p.file ?? "playlist.m3u8";
  const ttl = p.ttlSeconds ?? Number(process.env.BUNNY_TOKEN_TTL ?? 86400);
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const signedPath = `/${p.guid}/`;
  const token = urlSafe(createHash("sha256").update(p.securityKey + signedPath + String(expires)).digest("base64"));
  return `https://${p.host}/${p.guid}/${file}?token=${token}&expires=${expires}&token_path=${encodeURIComponent(signedPath)}`;
}

function inferType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes(".m3u8")) return "HLS";
  if (u.includes(".mpd")) return "DASH";
  if (u.includes(".mp4")) return "MP4";
  if (u.includes(".mov")) return "MOV";
  return "MP4";
}

export function resolveStreamUrl(video: { streamUrl?: string | null; thumbnailUrl?: string | null; }): { url: string; videoType: string } | null {
  const key = process.env.BUNNY_TOKEN_KEY;
  const host = bunnyHostFrom(video.thumbnailUrl, process.env.BUNNY_STREAM_HOST);
  const guid = extractBunnyGuid(video.streamUrl) ?? extractBunnyGuid(video.thumbnailUrl);
  if (key && host && guid) {
    return { url: signBunnyHls({ host, guid, securityKey: key }), videoType: "HLS" };
  }
  if (video.streamUrl) return { url: video.streamUrl, videoType: inferType(video.streamUrl) };
  return null;
}

export function resolveThumbnail(url: string | null | undefined): string {
  const key = process.env.BUNNY_TOKEN_KEY;
  if (!url) return "";
  if (!key) return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("b-cdn.net")) return url;
    const ttl = Number(process.env.BUNNY_TOKEN_TTL ?? 86400);
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const token = urlSafe(createHash("sha256").update(key + u.pathname + String(expires)).digest("base64"));
    return `${u.origin}${u.pathname}?token=${token}&expires=${expires}`;
  } catch {
    return url;
  }
}
