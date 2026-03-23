import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getFeedData, getChannelBySlug, getChannels } from "../db";
import { generateRokuFeed } from "../feedGenerator";
import {
  getCachedFeedRedis,
  setCachedFeedRedis,
  invalidateFeedCacheRedis,
} from "../redisFeedCache";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ─── Health Check ─────────────────────────────────────────────────────────
  // GET /api/health — lightweight liveness probe used by the Roku app before
  // attempting config/feed fetches.  Returns a 200 with a JSON body so the
  // Roku app can distinguish "server up but misconfigured" from "server down".
  // The response includes a serverTime field so the Roku app can detect large
  // clock skew between the device and the backend.
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({
      status: "ok",
      service: "rilan-roku-platform",
      serverTime: new Date().toISOString(),
    });
  });

  // ─── Channel Discovery ────────────────────────────────────────────────────
  // GET /api/roku/channels.json — returns the list of active channels for the
  // Phase 2 single-app multi-channel selector screen.
  //
  // Response shape:
  //   {
  //     channels: [
  //       {
  //         slug:         string   — unique channel identifier
  //         name:         string   — display name shown in the selector
  //         description:  string   — short description (may be empty)
  //         language:     string   — ISO 639-1 language code
  //         contentRating:string   — e.g. "G", "TV-G", "TV-14"
  //         logoUrl:      string   — absolute URL to channel logo (may be empty)
  //         configUrl:    string   — /api/roku/config/<slug>.json
  //         feedUrl:      string   — /api/roku/feed/<slug>.json
  //       }
  //     ]
  //   }
  //
  // Only channels with status = "active" are included.
  // The response is cached for 60 seconds — channel list changes are rare and
  // a 1-minute delay is acceptable.
  app.get("/api/roku/channels.json", async (req, res) => {
    try {
      const allChannels = await getChannels();
      const activeChannels = allChannels
        .filter((ch) => ch.status === "active")
        .map((ch) => ({
          slug:          ch.slug,
          name:          ch.name,
          description:   ch.description ?? "",
          language:      ch.language ?? "en",
          contentRating: ch.contentRating ?? "G",
          // logoUrl is stored inside brandingJson, not as a top-level column.
          // Extract it defensively; fall back to empty string if absent.
          logoUrl:       (ch.brandingJson as Record<string, string> | null)?.logoUrl ?? "",
          configUrl:     `/api/roku/config/${ch.slug}.json`,
          feedUrl:       `/api/roku/feed/${ch.slug}.json`,
        }));

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({ channels: activeChannels });
    } catch (err) {
      console.error("[ChannelDiscovery] Error:", err);
      res.status(500).json({ error: "Channel list unavailable" });
    }
  });

  // ─── Public Roku Feed Endpoints ───────────────────────────────────────────
  // GET /api/roku/feed/:slug.json — Roku Direct Publisher feed (with 5-min TTL cache)
  app.get("/api/roku/feed/:slug", async (req, res) => {
    try {
      const slug = req.params.slug.replace(/\.json$/, "");

      // Check Redis cache first
      const cached = await getCachedFeedRedis(slug);
      if (cached) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-Cache", "HIT");
        res.send(cached);
        return;
      }

      const data = await getFeedData(slug);
      if (!data) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      const { channel, rows, channelVideoRows, vcMappings } = data;
      if (channel.status !== "active") {
        res.status(403).json({ error: "Channel is not active" });
        return;
      }
      const feed = generateRokuFeed(channel, rows, channelVideoRows, vcMappings);
      const feedJson = JSON.stringify(feed);

      // Store in Redis cache (5-minute TTL)
      await setCachedFeedRedis(slug, feedJson);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Cache", "MISS");
      res.send(feedJson);
    } catch (err) {
      console.error("[Feed] Error generating feed:", err);
      res.status(500).json({ error: "Feed generation failed" });
    }
  });

  // ─── Config schema version ──────────────────────────────────────────────────
  // Increment this constant whenever the config JSON shape changes in a way
  // that a Roku app built against the previous version cannot handle silently.
  // The Roku app reads this value and logs a warning if the received version
  // exceeds the version it was built to understand.
  //
  // Version history:
  //   1 — initial shape: featureFlags, adSettings, theme, branding
  //
  // When to bump:
  //   - Renaming a top-level key (e.g. featureFlags → features)
  //   - Removing a key that the Roku app reads
  //   - Changing the type of an existing key
  //   - Adding a new required key (optional additions do NOT require a bump)
  const CONFIG_SCHEMA_VERSION = 1;

  // GET /api/roku/config/:slug.json — Channel config for Roku app
  app.get("/api/roku/config/:slug", async (req, res) => {
    try {
      const slug = req.params.slug.replace(/\.json$/, "");
      const channel = await getChannelBySlug(slug);
      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      const config = {
        // configVersion must always be the first field so it is visible at the
        // top of the response in browser dev tools and curl output.
        configVersion: CONFIG_SCHEMA_VERSION,
        channelId: channel.id,
        name: channel.name,
        slug: channel.slug,
        language: channel.language,
        contentRating: channel.contentRating,
        feedUrl: `/api/roku/feed/${slug}.json`,
        theme: channel.themeJson ?? {},
        // featureFlags is the current key name.  If this is ever renamed,
        // bump CONFIG_SCHEMA_VERSION and add the old name as a deprecated alias
        // in ConfigMapper.brs (_resolveFeatureFlags) so existing Roku apps
        // continue to work until they are updated.
        featureFlags: channel.featureFlagsJson ?? {},
        adSettings: channel.adSettingsJson ?? {},
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json(config);
    } catch (err) {
      console.error("[Config] Error generating config:", err);
      res.status(500).json({ error: "Config generation failed" });
    }
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
