import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sparkles,
  Tag,
  FileText,
  ShieldCheck,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Info,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = "pending" | "running" | "completed" | "failed";

type AiJob = {
  id: number;
  jobType: string;
  status: JobStatus;
  videoId: number | null;
  channelId: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  processedCount: number | null;
  failedCount: number | null;
  createdAt: Date;
  completedAt: Date | null;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    running: { label: "Running", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completed: { label: "Completed", className: "bg-green-500/15 text-green-400 border-green-500/30" },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const { label, className } = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={className}>
      {status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
      {status === "failed" && <XCircle className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  );
}

function JobTypeLabel({ type }: { type: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode }> = {
    enrich_video: { label: "Enrich Video", icon: <Sparkles className="w-3.5 h-3.5" /> },
    bulk_enrich: { label: "Bulk Enrich", icon: <Layers className="w-3.5 h-3.5" /> },
    generate_tags: { label: "Generate Tags", icon: <Tag className="w-3.5 h-3.5" /> },
    validate_content: { label: "Validate Content", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    generate_description: { label: "Generate Description", icon: <FileText className="w-3.5 h-3.5" /> },
    generate_title: { label: "Generate Title", icon: <FileText className="w-3.5 h-3.5" /> },
  };
  const { label, icon } = map[type] ?? { label: type, icon: <Zap className="w-3.5 h-3.5" /> };
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function JobRow({ job }: { job: AiJob }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <JobTypeLabel type={job.jobType} />
        </span>
        <StatusBadge status={job.status} />
        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
          {new Date(job.createdAt).toLocaleString()}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/20 space-y-2">
          {job.resultSummary && (
            <p className="text-sm text-foreground">{job.resultSummary}</p>
          )}
          {job.errorMessage && (
            <p className="text-sm text-red-400">{job.errorMessage}</p>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {job.videoId && <span>Video ID: {job.videoId}</span>}
            {job.channelId && <span>Channel ID: {job.channelId}</span>}
            {job.processedCount != null && job.processedCount > 0 && (
              <span>Processed: {job.processedCount}</span>
            )}
            {job.failedCount != null && job.failedCount > 0 && (
              <span className="text-red-400">Failed: {job.failedCount}</span>
            )}
            {job.completedAt && (
              <span>Completed: {new Date(job.completedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bulk Enrich Panel ────────────────────────────────────────────────────────

function BulkEnrichPanel() {
  const [channelId, setChannelId] = useState<string>("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [apply, setApply] = useState(false);
  const [limit, setLimit] = useState("20");

  const { data: channels } = trpc.channels.list.useQuery();
  const utils = trpc.useUtils();

  const bulkEnrich = trpc.ai.bulkEnrich.useMutation({
    onSuccess: (data) => {
      toast.success(data.processed > 0 ? "Bulk Enrichment Complete" : "Nothing to Enrich", {
        description: data.message ?? `Processed ${data.processed} videos. ${data.failed > 0 ? `${data.failed} failed.` : ""}`,
      });
      utils.ai.listJobs.invalidate();
    },
    onError: (err) => {
      toast.error("Bulk Enrichment Failed", { description: err.message });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-500/15">
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base">Bulk Enrich Channel</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Run AI enrichment across all videos in a channel at once
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Channel</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a channel..." />
            </SelectTrigger>
            <SelectContent>
              {channels?.map((ch) => (
                <SelectItem key={ch.id} value={String(ch.id)}>
                  {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Max Videos to Process</Label>
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 30, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} videos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Only enrich videos missing data</Label>
              <p className="text-xs text-muted-foreground">Skip videos that already have descriptions and tags</p>
            </div>
            <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Apply changes immediately</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-48">When off, results are returned as a preview only — no video data is changed.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">Write AI-generated content back to video records</p>
            </div>
            <Switch checked={apply} onCheckedChange={setApply} />
          </div>
        </div>

        {apply && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">
              <strong>Apply mode is on.</strong> AI-generated titles, descriptions, tags, and content ratings will overwrite existing video data. This cannot be undone automatically.
            </p>
          </div>
        )}

        <Button
          className="w-full"
          disabled={!channelId || bulkEnrich.isPending}
          onClick={() =>
            bulkEnrich.mutate({
              channelId: Number(channelId),
              onlyMissing,
              apply,
              limit: Number(limit),
            })
          }
        >
          {bulkEnrich.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
          ) : (
            <><Layers className="w-4 h-4 mr-2" /> Run Bulk Enrichment</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Single Video Panel ───────────────────────────────────────────────────────

function SingleVideoPanel() {
  const [videoId, setVideoId] = useState<string>("");
  const [apply, setApply] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);

  const { data: videosData } = trpc.videos.list.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const enrichVideo = trpc.ai.enrichVideo.useMutation({
    onSuccess: (data) => {
      toast.success("Error", { description: data.applied
          ? `Title, description, tags, and rating updated.`
          : `Preview generated. Toggle "Apply changes" to save.` });
      utils.ai.listJobs.invalidate();
      setActiveOp(null);
    },
    onError: (err) => {
      toast.error("Enrichment Failed", { description: err.message });
      setActiveOp(null);
    },
  });

  const generateTags = trpc.ai.generateTags.useMutation({
    onSuccess: (data) => {
      toast.success("Tags Generated", {
        description: `${data.tags.length} tags suggested: ${data.tags.slice(0, 4).join(", ")}${data.tags.length > 4 ? "..." : ""}`,
      });
      utils.ai.listJobs.invalidate();
      setActiveOp(null);
    },
    onError: (err) => {
      toast.error("Tag Generation Failed", { description: err.message });
      setActiveOp(null);
    },
  });

  const validateContent = trpc.ai.validateContent.useMutation({
    onSuccess: (data) => {
      const errorCount = data.result.issues.filter((i) => i.severity === "error").length;
      const warnCount = data.result.issues.filter((i) => i.severity === "warning").length;
      const toastFn = errorCount > 0 ? toast.error : toast.success;
      toastFn(`Compliance Score: ${data.result.score}/100`, {
        description: `${errorCount} error(s), ${warnCount} warning(s). ${data.result.summary}`,
      });
      utils.ai.listJobs.invalidate();
      setActiveOp(null);
    },
    onError: (err) => {
      toast.error("Validation Failed", { description: err.message });
      setActiveOp(null);
    },
  });

  const generateDescription = trpc.ai.generateDescription.useMutation({
    onSuccess: (data) => {
      toast.success("Error", { description: data.description.slice(0, 100) + (data.description.length > 100 ? "..." : "") });
      utils.ai.listJobs.invalidate();
      setActiveOp(null);
    },
    onError: (err) => {
      toast.error("Description Generation Failed", { description: err.message });
      setActiveOp(null);
    },
  });

  const isLoading = enrichVideo.isPending || generateTags.isPending || validateContent.isPending || generateDescription.isPending;

  const ops = [
    {
      id: "enrich",
      label: "Full Enrich",
      description: "Generate improved title, description, tags, and content rating",
      icon: <Sparkles className="w-4 h-4" />,
      color: "text-purple-400",
      bg: "bg-purple-500/15",
      action: () => {
        setActiveOp("enrich");
        enrichVideo.mutate({ videoId: Number(videoId), apply });
      },
    },
    {
      id: "tags",
      label: "Generate Tags",
      description: "Suggest 8-12 relevant tags based on title and description",
      icon: <Tag className="w-4 h-4" />,
      color: "text-blue-400",
      bg: "bg-blue-500/15",
      action: () => {
        setActiveOp("tags");
        generateTags.mutate({ videoId: Number(videoId) });
      },
    },
    {
      id: "description",
      label: "Generate Description",
      description: "Write a compelling 2-3 sentence description for Roku listings",
      icon: <FileText className="w-4 h-4" />,
      color: "text-green-400",
      bg: "bg-green-500/15",
      action: () => {
        setActiveOp("description");
        generateDescription.mutate({ videoId: Number(videoId), apply });
      },
    },
    {
      id: "validate",
      label: "Validate Compliance",
      description: "Check metadata against Roku Direct Publisher requirements",
      icon: <ShieldCheck className="w-4 h-4" />,
      color: "text-amber-400",
      bg: "bg-amber-500/15",
      action: () => {
        setActiveOp("validate");
        validateContent.mutate({ videoId: Number(videoId) });
      },
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-500/15">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Single Video AI Tools</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Run AI operations on a specific video
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Video</Label>
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a video..." />
            </SelectTrigger>
            <SelectContent>
              {videosData?.items?.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">Apply changes immediately</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-48">When off, AI results are returned as a preview in the job log without modifying the video.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">Write results back to the video record</p>
          </div>
          <Switch checked={apply} onCheckedChange={setApply} />
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-2">
          {ops.map((op) => (
            <button
              key={op.id}
              disabled={!videoId || isLoading}
              onClick={op.action}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className={`p-1.5 rounded-md ${op.bg}`}>
                <span className={op.color}>{op.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{op.label}</p>
                <p className="text-xs text-muted-foreground">{op.description}</p>
              </div>
              {isLoading && activeOp === op.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Job History ──────────────────────────────────────────────────────────────

function JobHistory() {
  const { data: jobs, isLoading, refetch } = trpc.ai.listJobs.useQuery({ limit: 30 });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">AI Job History</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Recent AI operations and their results
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No AI jobs yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Run an AI operation above to see results here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job as AiJob} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h1 className="text-2xl font-bold tracking-tight">AI Features</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Use AI to enrich video metadata, generate tags and descriptions, validate Roku compliance, and bulk-process your content library.
        </p>
      </div>

      {/* Capability overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Sparkles className="w-4 h-4" />, label: "Full Enrich", desc: "Title, description, tags, rating", color: "text-purple-400", bg: "bg-purple-500/10" },
          { icon: <Tag className="w-4 h-4" />, label: "Tag Generation", desc: "8-12 relevant tags per video", color: "text-blue-400", bg: "bg-blue-500/10" },
          { icon: <FileText className="w-4 h-4" />, label: "Descriptions", desc: "Compelling Roku-ready copy", color: "text-green-400", bg: "bg-green-500/10" },
          { icon: <ShieldCheck className="w-4 h-4" />, label: "Compliance Check", desc: "Roku Direct Publisher audit", color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((cap) => (
          <div key={cap.label} className={`rounded-lg border border-border p-3 ${cap.bg}`}>
            <div className={`${cap.color} mb-2`}>{cap.icon}</div>
            <p className="text-sm font-medium">{cap.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p>
          </div>
        ))}
      </div>

      {/* Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SingleVideoPanel />
        <BulkEnrichPanel />
      </div>

      {/* Job History */}
      <JobHistory />
    </div>
  );
}
