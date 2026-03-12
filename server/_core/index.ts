import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getFeedData, getChannelBySlug } from "../db";
import { generateRokuFeed } from "../feedGenerator";
import { getCachedFeed, setCachedFeed } from "../feedCache";

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

  // ─── Public Roku Feed Endpoints ───────────────────────────────────────────
  // GET /api/roku/feed/:slug.json — Roku Direct Publisher feed (with 5-min TTL cache)
  app.get("/api/roku/feed/:slug", async (req, res) => {
    try {
      const slug = req.params.slug.replace(/\.json$/, "");

      // Check cache first
      const cached = getCachedFeed(slug);
      if (cached) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Age", String(Math.round((Date.now() - cached.generatedAt) / 1000)));
        res.send(cached.feedJson);
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

      // Store in cache (5-minute TTL)
      setCachedFeed(slug, feedJson);

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
        channelId: channel.id,
        name: channel.name,
        slug: channel.slug,
        language: channel.language,
        contentRating: channel.contentRating,
        feedUrl: `/api/roku/feed/${slug}.json`,
        theme: channel.themeJson ?? {},
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
