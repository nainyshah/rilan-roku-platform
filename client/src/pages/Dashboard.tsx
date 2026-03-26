import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Film, Tv, CheckCircle, AlertTriangle, FileText, Clock, Radio, ArrowRight, Wifi, WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";

// ─── Health check hook ────────────────────────────────────────────────────────
type HealthStatus = "checking" | "ok" | "degraded" | "down";

interface HealthEntry {
  timestamp: Date;
  status: HealthStatus;
  latencyMs: number | null;
  error: string | null;
}

interface HealthState {
  status: HealthStatus;
  latencyMs: number | null;
  serverTime: string | null;
  lastChecked: Date | null;
  error: string | null;
  /** Rolling 24-hour uptime percentage (0-100), null until ≥2 checks recorded. */
  uptimePct: number | null;
  /** Last 10 check results for the history log. */
  history: HealthEntry[];
}

// Maximum age of entries kept in the rolling window (24 hours in ms)
const UPTIME_WINDOW_MS = 24 * 60 * 60 * 1000;

/** localStorage key for persisted health check history. */
const HEALTH_HISTORY_KEY = "rilan_health_history";

/**
 * Serialise HealthEntry[] to localStorage.
 * Timestamps are stored as ISO strings and restored as Date objects on read.
 * Silently no-ops if localStorage is unavailable (e.g. private browsing).
 */
function saveHealthHistory(history: HealthEntry[]): void {
  try {
    // Prune to 24-hour window before saving to keep storage size bounded
    const now = Date.now();
    const pruned = history.filter((e) => now - e.timestamp.getTime() <= UPTIME_WINDOW_MS);
    localStorage.setItem(HEALTH_HISTORY_KEY, JSON.stringify(
      pruned.map((e) => ({ ...e, timestamp: e.timestamp.toISOString() }))
    ));
  } catch {
    // localStorage may be blocked in some browser configurations — ignore silently
  }
}

/**
 * Restore HealthEntry[] from localStorage.
 * Returns an empty array if nothing is stored or the data is malformed.
 * Entries older than 24 hours are discarded on load.
 */
function loadHealthHistory(): HealthEntry[] {
  try {
    const raw = localStorage.getItem(HEALTH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: Array<{ timestamp: string; status: HealthStatus; latencyMs: number | null; error: string | null }> =
      JSON.parse(raw);
    const now = Date.now();
    return parsed
      .map((e) => ({ ...e, timestamp: new Date(e.timestamp) }))
      .filter((e) => now - e.timestamp.getTime() <= UPTIME_WINDOW_MS);
  } catch {
    return [];
  }
}

/**
 * Compute the rolling uptime percentage from a list of check entries.
 *
 * A check is counted as "up" when its status is "ok" or "degraded".
 * "down" and "checking" entries count as outages.
 *
 * We need at least 2 entries to produce a meaningful percentage.
 */
function computeUptimePct(history: HealthEntry[]): number | null {
  const now = Date.now();
  const window = history.filter((e) => now - e.timestamp.getTime() <= UPTIME_WINDOW_MS);
  if (window.length < 2) return null;
  const up = window.filter((e) => e.status === "ok" || e.status === "degraded").length;
  return Math.round((up / window.length) * 1000) / 10; // one decimal place
}

function useHealthCheck(intervalMs = 60_000) {
  const [health, setHealth] = useState<HealthState>(() => {
    // Hydrate from localStorage on first mount so uptime % is immediately available
    const savedHistory = loadHealthHistory();
    return {
      status: "checking",
      latencyMs: null,
      serverTime: null,
      // Restore lastChecked from the most recent saved entry if available
      lastChecked: savedHistory.length > 0
        ? savedHistory[savedHistory.length - 1].timestamp
        : null,
      error: null,
      uptimePct: computeUptimePct(savedHistory),
      history: savedHistory,
    };
  });

  const check = useCallback(async () => {
    const start = performance.now();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const latencyMs = Math.round(performance.now() - start);
      const newStatus: HealthStatus = res.ok
        ? latencyMs > 2000 ? "degraded" : "ok"
        : res.status >= 500 ? "down" : "degraded";
      const body = res.ok ? await res.json() : null;

      setHealth((prev) => {
        const entry: HealthEntry = {
          timestamp: new Date(),
          status: newStatus,
          latencyMs,
          error: res.ok ? null : `HTTP ${res.status}`,
        };
        // Append new entry; keep only the last 1440 entries (24 h at 1-min intervals)
        const allHistory = [...prev.history, entry].slice(-1440);
        // Persist to localStorage so uptime % survives page reloads
        saveHealthHistory(allHistory);
        return {
          status: newStatus,
          latencyMs,
          serverTime: body?.serverTime ?? null,
          lastChecked: entry.timestamp,
          error: entry.error,
          uptimePct: computeUptimePct(allHistory),
          history: allHistory,
        };
      });
    } catch (err) {
      setHealth((prev) => {
        const entry: HealthEntry = {
          timestamp: new Date(),
          status: "down",
          latencyMs: null,
          error: err instanceof Error ? err.message : "Network error",
        };
        const allHistory = [...prev.history, entry].slice(-1440);
        // Persist failure entries too so outages are reflected in the uptime %
        saveHealthHistory(allHistory);
        return {
          status: "down",
          latencyMs: null,
          serverTime: null,
          lastChecked: entry.timestamp,
          error: entry.error,
          uptimePct: computeUptimePct(allHistory),
          history: allHistory,
        };
      });
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { health, refresh: check };
}

// ─── Health badge component ────────────────────────────────────────────────────────
function HealthBadge({ health, onRefresh }: { health: HealthState; onRefresh: () => void }) {
  const configs: Record<HealthStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
    checking: { label: "Checking…",  dot: "bg-zinc-400 animate-pulse",  text: "text-zinc-400",   border: "border-zinc-500/30",   bg: "bg-zinc-500/10" },
    ok:       { label: "Operational", dot: "bg-emerald-400",             text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
    degraded: { label: "Degraded",    dot: "bg-amber-400 animate-pulse", text: "text-amber-400",   border: "border-amber-500/30",   bg: "bg-amber-500/10" },
    down:     { label: "Unavailable", dot: "bg-red-500 animate-pulse",   text: "text-red-400",     border: "border-red-500/30",     bg: "bg-red-500/10" },
  };
  const c = configs[health.status];

  // Colour the uptime percentage: green ≥99%, amber 95-99%, red <95%
  const uptimeColor =
    health.uptimePct === null ? "text-muted-foreground"
    : health.uptimePct >= 99  ? "text-emerald-400"
    : health.uptimePct >= 95  ? "text-amber-400"
    : "text-red-400";

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.border} ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
      <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
      {health.latencyMs !== null && (
        <span className="text-xs text-muted-foreground">{health.latencyMs} ms</span>
      )}
      {/* Rolling 24-hour uptime percentage — shown once ≥2 checks are recorded */}
      {health.uptimePct !== null && (
        <span
          className={`text-xs font-medium hidden sm:inline ${uptimeColor}`}
          title={`Rolling 24-hour uptime based on ${health.history.length} check${health.history.length !== 1 ? "s" : ""}`}
        >
          · {health.uptimePct.toFixed(1)}% uptime
        </span>
      )}
      {health.lastChecked && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          · {health.lastChecked.toLocaleTimeString()}
        </span>
      )}
      <button
        onClick={onRefresh}
        className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Refresh health check"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
}

/** Format a Date as a human-readable relative label. */
function formatLastSynced(d: Date | null): string {
  if (!d) return 'Never';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { health, refresh: refreshHealth } = useHealthCheck(60_000);
  const { lastSyncedAt, uptimePct: polledUptimePct, pollCount } = useSyncStatus();

  // Tick every 30 s so the relative label ("2m ago") stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const statCards = [
    {
      title: "Total Channels",
      value: stats?.totalChannels ?? 0,
      sub: `${stats?.activeChannels ?? 0} active`,
      icon: Tv,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      action: () => setLocation("/channels"),
    },
    {
      title: "Total Videos",
      value: stats?.totalVideos ?? 0,
      sub: `${stats?.publishedVideos ?? 0} published`,
      icon: Film,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      action: () => setLocation("/videos"),
    },
    {
      title: "Published",
      value: stats?.publishedVideos ?? 0,
      sub: "Live in feeds",
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      action: () => setLocation("/videos?status=published"),
    },
    {
      title: "Drafts",
      value: stats?.draftVideos ?? 0,
      sub: "Awaiting review",
      icon: FileText,
      color: "text-zinc-400",
      bg: "bg-zinc-500/10",
      action: () => setLocation("/videos?status=draft"),
    },
    {
      title: "Pending",
      value: stats?.pendingVideos ?? 0,
      sub: "Awaiting approval",
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      action: () => setLocation("/videos?status=pending"),
    },
    {
      title: "Validation Errors",
      value: stats?.validationErrors ?? 0,
      sub: "Need attention",
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      action: () => setLocation("/videos"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RILAN Roku Content Platform — channel publishing overview
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* ── Last synced timestamp ── updated by useHealthPolling on every successful refetch */}
          <div
            className="flex items-center gap-1.5 text-xs"
            title={lastSyncedAt ? `Last confirmed fresh: ${lastSyncedAt.toLocaleString()}` : 'No sync recorded yet'}
          >
            {!lastSyncedAt && (
              <CloudOff className="h-3 w-3 text-amber-400 shrink-0" />
            )}
            <span className="hidden sm:inline text-muted-foreground">
              {lastSyncedAt ? (
                <>
                  Synced{' '}
                  <span className="font-medium text-foreground/80">{formatLastSynced(lastSyncedAt)}</span>
                  {pollCount > 1 && (
                    <span className="ml-1 text-muted-foreground/50">({pollCount} checks)</span>
                  )}
                </>
              ) : (
                <span className="text-amber-400/80">Not yet synced</span>
              )}
            </span>
          </div>

          {/* ── Health badge — prefers polled uptime from useHealthPolling when available */}
          <HealthBadge
            health={{
              ...health,
              uptimePct: polledUptimePct !== null ? polledUptimePct : health.uptimePct,
            }}
            onRefresh={refreshHealth}
          />

          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">RILAN GAMES LLC</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className="bg-card border-border cursor-pointer hover:border-primary/40 transition-colors group"
            onClick={card.action}
          >
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded mb-1" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{card.title}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Service Status Card — shown when degraded or down */}
      {(health.status === "degraded" || health.status === "down") && (
        <Card className={`border ${
          health.status === "down" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {health.status === "down" ? (
                <WifiOff className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              ) : (
                <Wifi className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  health.status === "down" ? "text-red-400" : "text-amber-400"
                }`}>
                  {health.status === "down" ? "Backend service is unavailable" : "Backend service is responding slowly"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {health.status === "down"
                    ? "Roku feed endpoints and CMS operations may be affected. Check server logs for details."
                    : `Response time is ${health.latencyMs} ms — above the 2 s threshold. Feed generation may be slow.`}
                </p>
                {health.error && (
                  <p className="text-xs font-mono text-muted-foreground mt-1 bg-muted px-2 py-1 rounded">
                    {health.error}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0"
                onClick={refreshHealth}
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Manage Channels", path: "/channels", icon: Tv },
              { label: "Add New Video", path: "/videos", icon: Film },
              { label: "Preview Feeds", path: "/feed-preview", icon: Radio },
              { label: "Publishing Workflow", path: "/publishing", icon: CheckCircle },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => setLocation(action.path)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm text-foreground">{action.label}</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Feed Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Public Roku Direct Publisher feed URLs for your active channels:
            </p>
            {[
              { slug: "shorts-tv", name: "RILAN Shorts TV" },
              { slug: "kids-tv", name: "RILAN Kids TV" },
              { slug: "food-tv", name: "RILAN Food TV" },
              { slug: "travel-tv", name: "RILAN Travel TV" },
            ].map((ch) => (
              <div key={ch.slug} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{ch.name}</span>
                <a
                  href={`/api/roku/feed/${ch.slug}.json`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline font-mono"
                >
                  /api/roku/feed/{ch.slug}.json
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
