import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Radio,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Copy,
  Globe,
  ToggleRight,
  ToggleLeft,
  RefreshCw,
  Database,
  Zap,
  Clock,
} from "lucide-react";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Cache status badge ────────────────────────────────────────────────────────
function CacheStatusBadge({
  status,
}: {
  status: {
    cached: boolean;
    source: "redis" | "memory" | "none";
    ageSeconds: number | null;
    expiresInSeconds: number | null;
  } | undefined;
}) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;

  if (!status.cached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Database className="w-3 h-3" /> Not cached
      </span>
    );
  }

  const ageStr =
    status.ageSeconds !== null
      ? status.ageSeconds < 60
        ? `${status.ageSeconds}s ago`
        : `${Math.floor(status.ageSeconds / 60)}m ${status.ageSeconds % 60}s ago`
      : null;

  const expiresStr =
    status.expiresInSeconds !== null && status.expiresInSeconds > 0
      ? `expires in ${status.expiresInSeconds}s`
      : null;

  const isRedis = status.source === "redis";

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium ${
          isRedis ? "text-emerald-400" : "text-blue-400"
        }`}
      >
        {isRedis ? <Zap className="w-3 h-3" /> : <Database className="w-3 h-3" />}
        {isRedis ? "Redis" : "Memory"}
      </span>
      {ageStr && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> {ageStr}
        </span>
      )}
      {expiresStr && (
        <span className="text-xs text-muted-foreground">{expiresStr}</span>
      )}
    </div>
  );
}

export default function Publishing() {
  const { data: channels, isLoading, refetch } = trpc.channels.list.useQuery({});
  const [validating, setValidating] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<
      number,
      {
        feedReady: boolean;
        validVideos: number;
        invalidVideos: number;
        warnings: number;
        totalVideosInChannel: number;
      }
    >
  >({});

  // Cache status for all channels
  const { data: cacheStatuses, refetch: refetchCache } =
    trpc.feed.channelCacheStatuses.useQuery(undefined, {
      refetchInterval: 15000, // auto-refresh every 15s
    });

  const cacheMap = new Map(
    (cacheStatuses ?? []).map((s) => [s.channelId, s])
  );

  const setStatusMutation = trpc.channels.setStatus.useMutation({
    onSuccess: () => {
      toast.success("Channel status updated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const validateMutation = trpc.feed.validate.useMutation({
    onSuccess: (data, variables) => {
      setValidationResults((prev) => ({
        ...prev,
        [variables.channelId]: {
          feedReady: data.feedReady,
          validVideos: data.validVideos,
          invalidVideos: data.invalidVideos,
          warnings: data.warnings,
          totalVideosInChannel: data.totalVideosInChannel,
        },
      }));
      setValidating(null);
      toast.success(
        `${data.channelName}: ${data.feedReady ? "Feed ready" : "Issues found"}`
      );
    },
    onError: (e) => {
      toast.error(e.message);
      setValidating(null);
    },
  });

  const invalidateCacheMutation = trpc.feed.invalidateCacheAndNotify.useMutation({
    onSuccess: (_, variables) => {
      toast.success(`Cache refreshed for ${variables.slug}`);
      setRefreshing(null);
      refetchCache();
    },
    onError: (e) => {
      toast.error(e.message);
      setRefreshing(null);
    },
  });

  const handleValidate = (channelId: number) => {
    setValidating(channelId);
    validateMutation.mutate({ channelId });
  };

  const handleForceRefresh = (channelId: number, slug: string) => {
    setRefreshing(slug);
    invalidateCacheMutation.mutate({ channelId, slug });
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/api/roku/feed/${slug}.json`;
    navigator.clipboard.writeText(url);
    toast.success("Feed URL copied");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Publishing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage channel publishing status and Roku Direct Publisher feed URLs
          </p>
        </div>

        {/* Info Banner */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Roku Direct Publisher Integration
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each active channel has a stable JSON feed URL for Roku Direct
                  Publisher. Feeds are cached in Redis (5-minute TTL) and fall
                  back to in-memory if Redis is unavailable. Use{" "}
                  <strong>Force Refresh</strong> to purge the cache and
                  regenerate immediately.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Feed format:{" "}
                  <span className="font-mono text-primary">
                    {window.location.origin}/api/roku/feed/[channel-slug].json
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Channel Publishing Table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Channel Publishing Status</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => refetchCache()}
              >
                <RefreshCw className="h-3 w-3" /> Refresh Cache Status
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Radio className="h-8 w-8 mx-auto mb-2 animate-pulse opacity-40" />
                <p className="text-sm">Loading channels...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">
                        Channel
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">
                        Status
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden lg:table-cell">
                        Cache
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">
                        Feed Health
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">
                        Feed URL
                      </th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels?.map((ch) => {
                      const vr = validationResults[ch.id];
                      const cs = cacheMap.get(ch.id);
                      return (
                        <tr
                          key={ch.id}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                        >
                          {/* Channel name */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                <Radio className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {ch.name}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {ch.slug}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Active/inactive toggle */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                  ch.status === "active"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : ch.status === "inactive"
                                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                                    : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                                }`}
                              >
                                {ch.status}
                              </span>
                              <button
                                onClick={() => {
                                  const next =
                                    ch.status === "active"
                                      ? "inactive"
                                      : "active";
                                  setStatusMutation.mutate({
                                    id: ch.id,
                                    status: next,
                                  });
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={
                                  ch.status === "active"
                                    ? "Deactivate"
                                    : "Activate"
                                }
                              >
                                {ch.status === "active" ? (
                                  <ToggleRight className="h-5 w-5 text-emerald-400" />
                                ) : (
                                  <ToggleLeft className="h-5 w-5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Cache status */}
                          <td className="px-4 py-4 hidden lg:table-cell">
                            <div className="flex items-center gap-2">
                              <CacheStatusBadge status={cs} />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 shrink-0"
                                title="Force Refresh — purge cache and regenerate feed"
                                disabled={refreshing === ch.slug}
                                onClick={() => handleForceRefresh(ch.id, ch.slug)}
                              >
                                <RefreshCw
                                  className={`h-3 w-3 ${
                                    refreshing === ch.slug
                                      ? "animate-spin text-primary"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </Button>
                            </div>
                          </td>

                          {/* Feed health */}
                          <td className="px-4 py-4 hidden md:table-cell">
                            {vr ? (
                              <div className="flex items-center gap-2">
                                {vr.feedReady ? (
                                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                                ) : vr.invalidVideos > 0 ? (
                                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                                )}
                                <div className="text-xs">
                                  <span className="text-foreground">
                                    {vr.totalVideosInChannel} videos
                                  </span>
                                  <span className="text-muted-foreground mx-1">
                                    ·
                                  </span>
                                  <span className="text-emerald-400">
                                    {vr.validVideos} valid
                                  </span>
                                  {vr.warnings > 0 && (
                                    <>
                                      <span className="text-muted-foreground mx-1">
                                        ·
                                      </span>
                                      <span className="text-amber-400">
                                        {vr.warnings} warn
                                      </span>
                                    </>
                                  )}
                                  {vr.invalidVideos > 0 && (
                                    <>
                                      <span className="text-muted-foreground mx-1">
                                        ·
                                      </span>
                                      <span className="text-red-400">
                                        {vr.invalidVideos} err
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not validated
                              </span>
                            )}
                          </td>

                          {/* Feed URL */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                                /api/roku/feed/{ch.slug}.json
                              </span>
                              <button
                                onClick={() => copyUrl(ch.slug)}
                                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                                title="Copy URL"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={`/api/roku/feed/${ch.slug}.json`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                                title="Open Feed"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => handleValidate(ch.id)}
                                disabled={validating === ch.id}
                              >
                                {validating === ch.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3 w-3" />
                                )}
                                Validate
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roku Setup Guide */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Roku Direct Publisher Setup Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="space-y-2">
              {[
                {
                  step: "1",
                  text: "Log in to the Roku Developer Dashboard at developer.roku.com",
                },
                {
                  step: "2",
                  text: "Navigate to Direct Publisher and create a new channel",
                },
                {
                  step: "3",
                  text: "In the Content Feed section, enter your channel's feed URL from the table above",
                },
                {
                  step: "4",
                  text: "Ensure your channel is set to Active status so the feed returns content",
                },
                {
                  step: "5",
                  text: "Validate the feed using the Validate button — fix any errors before submitting to Roku",
                },
                {
                  step: "6",
                  text: "Submit your channel for Roku certification review",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {item.step}
                  </span>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-foreground mb-1">
                Feed Requirements
              </p>
              <ul className="space-y-1">
                <li>
                  • Each video must have a title, thumbnail URL, stream URL, and
                  duration
                </li>
                <li>
                  • Stream URLs must be publicly accessible (MP4, HLS/M3U8, or
                  DASH/MPD)
                </li>
                <li>
                  • Thumbnails should be at least 800×450 pixels (16:9 aspect
                  ratio)
                </li>
                <li>
                  • Channel must be set to Active status for the feed to serve
                  content
                </li>
                <li>
                  • Use Force Refresh (↺ icon) to immediately purge the Redis
                  cache and regenerate the feed after bulk changes
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
