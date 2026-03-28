/**
 * File storage helpers — self-hosted S3-compatible backend.
 *
 * Supported providers (all S3-compatible):
 *   - AWS S3          → set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   - MinIO           → additionally set S3_ENDPOINT (e.g. http://minio:9000)
 *   - Cloudflare R2   → set S3_ENDPOINT to your R2 endpoint + S3_BUCKET
 *
 * Public-read bucket: storagePut returns the public URL directly.
 * Private bucket:     storageGet returns a presigned URL (1-hour expiry).
 *
 * Dev-mode fallback: when S3_BUCKET is absent, files are written to
 * /tmp/rilan-storage/<key> and served via a local file:// URL so the
 * rest of the application keeps working without cloud credentials.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs";
import path from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

function getStorageConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null; // dev-mode fallback

  return {
    bucket,
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  };
}

function buildS3Client(cfg: StorageConfig): S3Client {
  return new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

// ─── Dev-mode local fallback ─────────────────────────────────────────────────

const LOCAL_STORAGE_DIR = "/tmp/rilan-storage";

function localPut(
  relKey: string,
  data: Buffer | Uint8Array | string
): { key: string; url: string } {
  const filePath = path.join(LOCAL_STORAGE_DIR, relKey);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data as Buffer);
  console.warn(
    `[Storage] S3_BUCKET not set — writing to local fallback: ${filePath}`
  );
  return { key: relKey, url: `file://${filePath}` };
}

function localGet(relKey: string): { key: string; url: string } {
  const filePath = path.join(LOCAL_STORAGE_DIR, relKey);
  console.warn(
    `[Storage] S3_BUCKET not set — returning local fallback URL for: ${relKey}`
  );
  return { key: relKey, url: `file://${filePath}` };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Upload bytes to S3 (or local fallback in dev mode).
 * Returns the public URL when S3_PUBLIC_BASE_URL is set, otherwise a
 * presigned GET URL valid for 1 hour.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();
  if (!cfg) return localPut(relKey, data);

  const client = buildS3Client(cfg);
  const body =
    typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: relKey,
      Body: body,
      ContentType: contentType,
    })
  );

  // Build URL: prefer explicit public base URL, then construct from endpoint/region
  let url: string;
  if (cfg.publicBaseUrl) {
    url = `${cfg.publicBaseUrl.replace(/\/+$/, "")}/${relKey}`;
  } else if (cfg.endpoint) {
    // MinIO / R2 path-style
    url = `${cfg.endpoint.replace(/\/+$/, "")}/${cfg.bucket}/${relKey}`;
  } else {
    // Standard AWS virtual-hosted style
    url = `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${relKey}`;
  }

  return { key: relKey, url };
}

/**
 * Get a presigned download URL for a stored file (1-hour expiry).
 * Falls back to local file path in dev mode.
 */
export async function storageGet(
  relKey: string,
  expiresIn = 3600
): Promise<{ key: string; url: string }> {
  const cfg = getStorageConfig();
  if (!cfg) return localGet(relKey);

  const client = buildS3Client(cfg);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: relKey }),
    { expiresIn }
  );

  return { key: relKey, url };
}
