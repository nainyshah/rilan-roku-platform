import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Film,
  FolderOpen,
  GripVertical,
  Save,
  Trash2,
  Tv,
  X,
  BarChart3,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Layers,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";

// ─── Schedule status helpers ──────────────────────────────────────────────────
type ScheduleStatus = "always" | "scheduled" | "live" | "expired";

function getScheduleStatus(publishFrom: Date | null, publishTo: Date | null): ScheduleStatus {
  if (!publishFrom && !publishTo) return "always";
  const now = new Date();
  if (publishTo && now > publishTo) return "expired";
  if (publishFrom && now < publishFrom) return "scheduled";
  return "live";
}

function ScheduleBadge({ publishFrom, publishTo }: { publishFrom: Date | null; publishTo: Date | null }) {
  const status = getScheduleStatus(publishFrom, publishTo);
  if (status === "always") return null;
  if (status === "expired")
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/25 flex items-center gap-1">
        <CalendarX2 className="w-3 h-3" /> Expired
      </span>
    );
  if (status === "scheduled")
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/25 flex items-center gap-1">
        <CalendarClock className="w-3 h-3" /> Scheduled
      </span>
    );
  return (
    <span className="text-xs px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25 flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3" /> Live window
    </span>
  );
}

// ─── Date-time local input helper ─────────────────────────────────────────────
function toDatetimeLocal(d: Date | null | undefined): string {
  if (!d) return "";
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

// ─── Schedule Picker Popover ──────────────────────────────────────────────────
function SchedulePicker({
  assignmentId,
  publishFrom,
  publishTo,
  onSaved,
}: {
  assignmentId: number;
  publishFrom: Date | null;
  publishTo: Date | null;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState(toDatetimeLocal(publishFrom));
  const [to, setTo] = useState(toDatetimeLocal(publishTo));
  const [open, setOpen] = useState(false);

  const utils = trpc.useUtils();
  const scheduleMutation = trpc.channels.setSchedule.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      utils.channels.getVideos.invalidate();
      onSaved();
      setOpen(false);
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const handleSave = () => {
    // Validate: if both set, from must be before to
    if (from && to && new Date(from) >= new Date(to)) {
      toast.error("Publish From must be before Publish To");
      return;
    }
    scheduleMutation.mutate({
      assignmentId,
      publishFrom: from ? fromDatetimeLocal(from) : null,
      publishTo: to ? fromDatetimeLocal(to) : null,
    });
  };

  const handleClear = () => {
    setFrom("");
    setTo("");
    scheduleMutation.mutate({ assignmentId, publishFrom: null, publishTo: null });
  };

  const hasSchedule = !!publishFrom || !!publishTo;
  const status = getScheduleStatus(publishFrom, publishTo);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 gap-1.5 text-xs ${
            hasSchedule
              ? status === "expired"
                ? "text-red-400 hover:text-red-300"
                : status === "scheduled"
                ? "text-blue-400 hover:text-blue-300"
                : "text-emerald-400 hover:text-emerald-300"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Set publish schedule"
        >
          <CalendarClock className="w-3.5 h-3.5" />
          {hasSchedule ? "Schedule" : "Schedule"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-4" align="end">
        <div>
          <h4 className="text-sm font-semibold mb-0.5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Publish Window
          </h4>
          <p className="text-xs text-muted-foreground">
            Set when this video goes live and expires in the channel feed. Leave blank for always-on.
          </p>
        </div>

        {hasSchedule && (
          <div className="flex justify-center">
            <ScheduleBadge publishFrom={publishFrom} publishTo={publishTo} />
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Publish From (goes live)
            </Label>
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs h-8"
            />
            {from && (
              <p className="text-xs text-muted-foreground">
                {new Date(from).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Publish To (expires)
            </Label>
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs h-8"
            />
            {to && (
              <p className="text-xs text-muted-foreground">
                {new Date(to).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={handleSave}
            disabled={scheduleMutation.isPending}
          >
            <Save className="w-3.5 h-3.5" />
            {scheduleMutation.isPending ? "Saving..." : "Save Schedule"}
          </Button>
          {hasSchedule && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={handleClear}
              disabled={scheduleMutation.isPending}
              title="Clear schedule (always on)"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground border-t pt-2">
          The Roku feed automatically includes/excludes this video based on the current time.
          The feed generator checks these windows on every request.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ─── Channel Statistics Panel ───────────────────────────────────────────────────
type ChannelStatsData = {
  totalVideos: number;
  publishedVideos: number;
  draftVideos: number;
  pendingVideos: number;
  approvedVideos: number;
  archivedVideos: number;
  validVideos: number;
  invalidVideos: number;
  warningVideos: number;
  uncheckedVideos: number;
  activeSchedules: number;
  scheduledFuture: number;
  expiredSchedules: number;
  alwaysOn: number;
  totalContentRows: number;
  channelStatus: string | null;
  channelUpdatedAt: Date | null;
  channelCreatedAt: Date | null;
};

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className={`rounded-lg p-4 border flex flex-col gap-1 ${color ?? "bg-muted/30 border-border"}` }>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChannelStatsPanel({ stats }: { stats: ChannelStatsData | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-lg border border-border" />
        ))}
      </div>
    );
  }

  const publishRate = stats.totalVideos > 0
    ? Math.round((stats.publishedVideos / stats.totalVideos) * 100)
    : 0;
  const validRate = stats.totalVideos > 0
    ? Math.round((stats.validVideos / stats.totalVideos) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Content overview */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Content Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Film className="w-3.5 h-3.5" />}
            label="Total Videos"
            value={stats.totalVideos}
            sub="Assigned to this channel"
          />
          <StatCard
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Published"
            value={stats.publishedVideos}
            sub={`${publishRate}% of total`}
            color="bg-emerald-500/10 border-emerald-500/20"
          />
          <StatCard
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label="Pending / Approved"
            value={stats.pendingVideos + stats.approvedVideos}
            sub={`${stats.pendingVideos} pending · ${stats.approvedVideos} approved`}
            color="bg-amber-500/10 border-amber-500/20"
          />
          <StatCard
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Draft / Archived"
            value={stats.draftVideos + stats.archivedVideos}
            sub={`${stats.draftVideos} draft · ${stats.archivedVideos} archived`}
          />
        </div>
      </div>

      {/* Validation status */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Validation Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
            label="Valid"
            value={stats.validVideos}
            sub={`${validRate}% pass rate`}
            color="bg-emerald-500/10 border-emerald-500/20"
          />
          <StatCard
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Errors"
            value={stats.invalidVideos}
            sub="Failed validation"
            color={stats.invalidVideos > 0 ? "bg-red-500/10 border-red-500/20" : "bg-muted/30 border-border"}
          />
          <StatCard
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Warnings"
            value={stats.warningVideos}
            sub="Need attention"
            color={stats.warningVideos > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/30 border-border"}
          />
          <StatCard
            icon={<Film className="w-3.5 h-3.5" />}
            label="Unchecked"
            value={stats.uncheckedVideos}
            sub="Not yet validated"
          />
        </div>
      </div>

      {/* Schedule status */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Schedule Windows</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="Live Windows"
            value={stats.activeSchedules}
            sub="Currently active"
            color={stats.activeSchedules > 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted/30 border-border"}
          />
          <StatCard
            icon={<CalendarClock className="w-3.5 h-3.5" />}
            label="Scheduled"
            value={stats.scheduledFuture}
            sub="Future windows"
            color={stats.scheduledFuture > 0 ? "bg-blue-500/10 border-blue-500/20" : "bg-muted/30 border-border"}
          />
          <StatCard
            icon={<CalendarX2 className="w-3.5 h-3.5" />}
            label="Expired"
            value={stats.expiredSchedules}
            sub="Past publish-to date"
            color={stats.expiredSchedules > 0 ? "bg-red-500/10 border-red-500/20" : "bg-muted/30 border-border"}
          />
          <StatCard
            icon={<Tv className="w-3.5 h-3.5" />}
            label="Always On"
            value={stats.alwaysOn}
            sub="No window set"
          />
        </div>
      </div>

      {/* Content rows & last updated */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 bg-muted/30 rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <FolderOpen className="w-3.5 h-3.5" /> Content Rows
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalContentRows}</p>
          <p className="text-xs text-muted-foreground">Home screen category rows</p>
        </div>
        {stats.channelUpdatedAt && (
          <div className="flex-1 min-w-48 bg-muted/30 rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" /> Last Updated
            </div>
            <p className="text-sm font-semibold text-foreground">
              {new Date(stats.channelUpdatedAt).toLocaleString()}
            </p>
            {stats.channelCreatedAt && (
              <p className="text-xs text-muted-foreground">
                Created {new Date(stats.channelCreatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const channelId = parseInt(id ?? "0");

  const { data: channel, isLoading, refetch } = trpc.channels.get.useQuery({ id: channelId }, { enabled: !!channelId });
  const { data: channelStats } = trpc.channels.stats.useQuery({ channelId }, { enabled: !!channelId, refetchInterval: 60_000 });
  const { data: channelVideos, refetch: refetchVideos } = trpc.channels.getVideos.useQuery({ channelId }, { enabled: !!channelId });
  const { data: channelCategories, refetch: refetchCategories } = trpc.channels.getCategories.useQuery({ channelId }, { enabled: !!channelId });
  const { data: allVideos } = trpc.videos.list.useQuery({ limit: 200 });
  const { data: allCategories } = trpc.categories.list.useQuery();

  const [form, setForm] = useState({ name: "", description: "", language: "en", contentRating: "all" });

  useEffect(() => {
    if (channel) {
      setForm({
        name: channel.name,
        description: channel.description ?? "",
        language: channel.language ?? "en",
        contentRating: channel.contentRating ?? "all",
      });
    }
  }, [channel]);

  const updateMutation = trpc.channels.update.useMutation({
    onSuccess: () => { toast.success("Channel updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const removeVideoMutation = trpc.channels.removeVideo.useMutation({
    onSuccess: () => { toast.success("Video removed"); refetchVideos(); },
    onError: (e) => toast.error(e.message),
  });

  const assignVideoMutation = trpc.channels.assignVideo.useMutation({
    onSuccess: () => { toast.success("Video assigned"); refetchVideos(); },
    onError: (e) => toast.error(e.message),
  });

  const removeCategoryMutation = trpc.channels.removeCategory.useMutation({
    onSuccess: () => { toast.success("Row removed"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  const assignCategoryMutation = trpc.channels.assignCategory.useMutation({
    onSuccess: () => { toast.success("Row added"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  const updateRowMutation = trpc.channels.updateCategoryRow.useMutation({
    onSuccess: () => { toast.success("Row updated"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <div className="h-64 bg-muted animate-pulse rounded-lg" />
    </div>
  );

  if (!channel) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Channel not found.</p>
      <Button variant="outline" onClick={() => setLocation("/channels")} className="mt-4">Back to Channels</Button>
    </div>
  );

  const assignedVideoIds = new Set(channelVideos?.map((r) => r.video.id) ?? []);
  const unassignedVideos = allVideos?.items.filter((v) => !assignedVideoIds.has(v.id)) ?? [];
  const assignedCategoryIds = new Set(channelCategories?.map((r) => r.category.id) ?? []);
  const unassignedCategories = allCategories?.filter((c) => !assignedCategoryIds.has(c.id)) ?? [];

  // Count scheduled/expired videos for the tab badge
  const scheduledCount = channelVideos?.filter((r) => {
    const s = getScheduleStatus(r.assignment.publishFrom, r.assignment.publishTo);
    return s === "scheduled" || s === "live";
  }).length ?? 0;
  const expiredCount = channelVideos?.filter((r) =>
    getScheduleStatus(r.assignment.publishFrom, r.assignment.publishTo) === "expired"
  ).length ?? 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/channels")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Channels
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-foreground">{channel.name}</h1>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          channel.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
          channel.status === "inactive" ? "bg-red-500/15 text-red-400 border-red-500/30" :
          "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
        }`}>{channel.status}</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">Feed: /api/roku/feed/{channel.slug}.json</span>
        <a href={`/api/roku/feed/${channel.slug}.json`} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> View Feed
        </a>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Statistics
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="videos" className="gap-2">
            Videos ({channelVideos?.length ?? 0})
            {scheduledCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">{scheduledCount} scheduled</span>
            )}
            {expiredCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">{expiredCount} expired</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rows">Content Rows ({channelCategories?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* Statistics Tab */}
        <TabsContent value="overview" className="mt-4">
          <ChannelStatsPanel stats={channelStats ?? null} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Channel Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Channel Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug (read-only)</Label>
                  <Input value={channel.slug} disabled className="font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Content Rating</Label>
                  <Select value={form.contentRating} onValueChange={(v) => setForm({ ...form, contentRating: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ages</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                      <SelectItem value="pg">PG</SelectItem>
                      <SelectItem value="pg-13">PG-13</SelectItem>
                      <SelectItem value="r">R</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => updateMutation.mutate({ id: channelId, ...form })}
                disabled={updateMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm">Assigned Videos</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click the <CalendarClock className="inline w-3 h-3" /> Schedule button on any video to set a publish window.
                </p>
              </div>
              <Select onValueChange={(videoId) => assignVideoMutation.mutate({ channelId, videoId: parseInt(videoId) })}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="+ Add video..." />
                </SelectTrigger>
                <SelectContent>
                  {unassignedVideos.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)} className="text-xs">{v.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {channelVideos?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No videos assigned. Add videos above.</p>
              ) : (
                <div className="space-y-2">
                  {channelVideos?.map((row) => {
                    const scheduleStatus = getScheduleStatus(row.assignment.publishFrom, row.assignment.publishTo);
                    return (
                      <div
                        key={row.assignment.id}
                        className={`flex items-center gap-3 p-3 rounded-lg group border transition-colors ${
                          scheduleStatus === "expired"
                            ? "bg-red-500/5 border-red-500/15"
                            : scheduleStatus === "scheduled"
                            ? "bg-blue-500/5 border-blue-500/15"
                            : scheduleStatus === "live"
                            ? "bg-emerald-500/5 border-emerald-500/15"
                            : "bg-muted/50 border-transparent"
                        }`}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        {row.video.thumbnailUrl && (
                          <img src={row.video.thumbnailUrl} alt="" className="h-10 w-16 object-cover rounded shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{row.video.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${
                              row.video.publishStatus === "published" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                              row.video.publishStatus === "draft" ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" :
                              "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }`}>{row.video.publishStatus}</span>
                            {row.assignment.featuredFlag && (
                              <span className="text-xs text-amber-400">★ Featured</span>
                            )}
                            <ScheduleBadge
                              publishFrom={row.assignment.publishFrom}
                              publishTo={row.assignment.publishTo}
                            />
                          </div>
                          {/* Show schedule dates inline when set */}
                          {(row.assignment.publishFrom || row.assignment.publishTo) && (
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {row.assignment.publishFrom && (
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                  From: {new Date(row.assignment.publishFrom).toLocaleString()}
                                </span>
                              )}
                              {row.assignment.publishTo && (
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                                  To: {new Date(row.assignment.publishTo).toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Schedule picker */}
                        <SchedulePicker
                          assignmentId={row.assignment.id}
                          publishFrom={row.assignment.publishFrom}
                          publishTo={row.assignment.publishTo}
                          onSaved={refetchVideos}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removeVideoMutation.mutate({ channelId, videoId: row.video.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule legend */}
          {(channelVideos?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
              <span className="font-medium">Schedule legend:</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Live window (currently active)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> Scheduled (not yet live)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Expired (past publish-to date)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-500" /> Always on (no window set)
              </span>
            </div>
          )}
        </TabsContent>

        {/* Content Rows Tab */}
        <TabsContent value="rows" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Content Rows (Home Screen)</CardTitle>
              <Select onValueChange={(catId) => assignCategoryMutation.mutate({ channelId, categoryId: parseInt(catId) })}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="+ Add row..." />
                </SelectTrigger>
                <SelectContent>
                  {unassignedCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {channelCategories?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No content rows. Add categories above.</p>
              ) : (
                <div className="space-y-2">
                  {channelCategories?.map((row) => (
                    <div key={row.row.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{row.row.rowTitle ?? row.category.name}</p>
                        <p className="text-xs text-muted-foreground">{row.category.name}</p>
                      </div>
                      <Switch
                        checked={row.row.isVisible}
                        onCheckedChange={(v) => updateRowMutation.mutate({ id: row.row.id, isVisible: v })}
                        className="scale-75"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-center">#{row.row.rowOrder}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => removeCategoryMutation.mutate({ channelId, categoryId: row.category.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
