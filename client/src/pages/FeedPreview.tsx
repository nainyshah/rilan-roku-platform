import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Radio,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Copy,
  Eye,
  FileJson,
} from "lucide-react";
import { useState } from "react";

export default function FeedPreview() {
  const { data: channels } = trpc.channels.list.useQuery({});
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feedData, setFeedData] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<{
    channelSlug: string;
    channelName: string;
    isChannelActive: boolean;
    totalVideosInChannel: number;
    validVideos: number;
    invalidVideos: number;
    warnings: number;
    emptyRows: string[];
    feedReady: boolean;
    videoResults: Array<{ videoId: number; title: string; status: string; issues: string[] }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);

  const previewMutation = trpc.feed.preview.useMutation({
    onSuccess: (data) => {
      setFeedData(data.feed);
      setValidationResult(null);
      setLoading(false);
    },
    onError: (e: { message: string }) => { toast.error(e.message); setLoading(false); },
  });

  const validateMutation = trpc.feed.validate.useMutation({
    onSuccess: (data) => {
      setValidationResult(data);
      const status = data.feedReady ? "ready" : data.invalidVideos > 0 ? "has errors" : "has warnings";
      toast.success(`Validation complete: feed is ${status}`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handlePreview = () => {
    if (!selectedChannelId) return;
    setLoading(true);
    previewMutation.mutate({ channelId: selectedChannelId });
  };

  const handleValidate = () => {
    if (!selectedChannelId) return;
    validateMutation.mutate({ channelId: selectedChannelId });
  };

  const copyFeedUrl = () => {
    if (!selectedChannel) return;
    const url = `${window.location.origin}/api/roku/feed/${selectedChannel.slug}.json`;
    navigator.clipboard.writeText(url);
    toast.success("Feed URL copied to clipboard");
  };

  const overallStatus = validationResult
    ? validationResult.feedReady ? "valid"
    : validationResult.invalidVideos > 0 ? "error" : "warning"
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Feed Preview</h1>
        <p className="text-sm text-muted-foreground mt-1">Preview and validate Roku Direct Publisher feeds</p>
      </div>

      {/* Controls */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-48">
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <Select
                value={selectedChannelId ? String(selectedChannelId) : ""}
                onValueChange={(v) => { setSelectedChannelId(parseInt(v)); setFeedData(null); setValidationResult(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a channel..." />
                </SelectTrigger>
                <SelectContent>
                  {channels?.map((ch) => (
                    <SelectItem key={ch.id} value={String(ch.id)}>
                      <div className="flex items-center gap-2">
                        <Radio className="h-3 w-3 text-primary" />
                        {ch.name}
                        <span className={`text-xs px-1.5 rounded ${ch.status === "active" ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {ch.status}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handlePreview} disabled={!selectedChannelId || loading} className="gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {loading ? "Loading..." : "Preview Feed"}
            </Button>
            <Button variant="outline" onClick={handleValidate} disabled={!selectedChannelId || validateMutation.isPending} className="gap-2">
              <CheckCircle className="h-4 w-4" />
              {validateMutation.isPending ? "Validating..." : "Validate"}
            </Button>
            {selectedChannel && (
              <>
                <Button variant="outline" onClick={copyFeedUrl} className="gap-2">
                  <Copy className="h-4 w-4" /> Copy URL
                </Button>
                <a
                  href={`/api/roku/feed/${selectedChannel.slug}.json`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors text-foreground"
                >
                  <ExternalLink className="h-4 w-4" /> Open Feed
                </a>
              </>
            )}
          </div>
          {selectedChannel && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Feed URL:{" "}
                <span className="font-mono text-primary">
                  {window.location.origin}/api/roku/feed/{selectedChannel.slug}.json
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Result */}
      {validationResult && (
        <Card className={`border ${
          overallStatus === "valid" ? "bg-emerald-500/5 border-emerald-500/30" :
          overallStatus === "warning" ? "bg-amber-500/5 border-amber-500/30" :
          "bg-red-500/5 border-red-500/30"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {overallStatus === "valid" ? <CheckCircle className="h-4 w-4 text-emerald-400" /> :
               overallStatus === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-400" /> :
               <XCircle className="h-4 w-4 text-red-400" />}
              <span className="font-semibold text-foreground">
                Feed {validationResult.feedReady ? "Ready" : "Not Ready"} — {validationResult.channelName}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="text-center p-2 bg-muted/50 rounded">
                <p className="text-lg font-bold text-foreground">{validationResult.totalVideosInChannel}</p>
                <p className="text-xs text-muted-foreground">Total Videos</p>
              </div>
              <div className="text-center p-2 bg-emerald-500/10 rounded">
                <p className="text-lg font-bold text-emerald-400">{validationResult.validVideos}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="text-center p-2 bg-amber-500/10 rounded">
                <p className="text-lg font-bold text-amber-400">{validationResult.warnings}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
              <div className="text-center p-2 bg-red-500/10 rounded">
                <p className="text-lg font-bold text-red-400">{validationResult.invalidVideos}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
            {validationResult.emptyRows.length > 0 && (
              <div className="mb-3 p-2 bg-amber-500/10 rounded text-xs text-amber-400">
                <p className="font-medium mb-1">Empty rows (no videos assigned):</p>
                <p>{validationResult.emptyRows.join(", ")}</p>
              </div>
            )}
            {validationResult.videoResults.some((r) => r.issues.length > 0) && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {validationResult.videoResults.filter((r) => r.issues.length > 0).map((r) => (
                  <div key={r.videoId} className={`p-2 rounded text-xs ${
                    r.status === "error" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                  }`}>
                    <p className="font-medium">{r.title}</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {r.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {validationResult.feedReady && (
              <p className="text-xs text-emerald-400 mt-2">✓ All checks passed. Feed is ready for Roku Direct Publisher.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feed Preview */}
      {feedData && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" />
                Feed Preview
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant={activeTab === "preview" ? "default" : "ghost"} className="h-7 text-xs px-3" onClick={() => setActiveTab("preview")}>Structured</Button>
                <Button size="sm" variant={activeTab === "raw" ? "default" : "ghost"} className="h-7 text-xs px-3" onClick={() => setActiveTab("raw")}>Raw JSON</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "raw" ? (
              <pre className="text-xs text-muted-foreground bg-muted/50 p-4 rounded-lg overflow-auto max-h-[600px] font-mono">
                {JSON.stringify(feedData, null, 2)}
              </pre>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Provider</p>
                      <p className="font-medium text-foreground">{String(feedData.providerName ?? "—")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Language</p>
                      <p className="font-medium text-foreground">{String(feedData.language ?? "—")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Updated</p>
                      <p className="font-medium text-foreground">{feedData.lastUpdated ? new Date(String(feedData.lastUpdated)).toLocaleString() : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Short-Form Videos</p>
                      <p className="font-medium text-foreground">{Array.isArray(feedData.shortFormVideos) ? feedData.shortFormVideos.length : 0}</p>
                    </div>
                  </div>
                </div>
                {Array.isArray(feedData.shortFormVideos) && feedData.shortFormVideos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Short-Form Videos ({feedData.shortFormVideos.length})</p>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {(feedData.shortFormVideos as Record<string, unknown>[]).map((v, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                          {v["thumbnail"] ? <img src={String(v["thumbnail"])} alt="" className="h-10 w-16 object-cover rounded" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : null}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{String(v.title ?? "—")}</p>
                            <p className="text-xs text-muted-foreground font-mono">{String(v.id ?? "").substring(0, 12)}…</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(feedData.categories) && feedData.categories.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Categories ({(feedData.categories as unknown[]).length})</p>
                    <div className="space-y-1">
                      {(feedData.categories as Record<string, unknown>[]).map((cat, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <span className="text-xs text-foreground">{String(cat["name"] ?? "—")}</span>
                          <span className="text-xs text-muted-foreground">{String(cat["playlistName"] ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!feedData && !loading && !selectedChannelId && (
        <div className="text-center py-16 text-muted-foreground">
          <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a channel and click Preview Feed to inspect the Roku Direct Publisher feed.</p>
        </div>
      )}
    </div>
  );
}
