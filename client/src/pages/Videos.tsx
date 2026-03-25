import { trpc } from "@/lib/trpc";
import AIDiffDialog, { type AISuggestion, type OriginalValues, type ApprovedFields } from "@/components/AIDiffDialog";
import { BulkDiffReviewDialog, type BulkSuggestion } from "@/components/BulkDiffReviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, Search, Film, AlertTriangle, CheckCircle, ShieldCheck,
  CalendarClock, CalendarX2, CalendarCheck2, Edit,
  CheckSquare, X, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
  Tag, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    approved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    draft: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    archived: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}

// ─── Validation badge ─────────────────────────────────────────────────────────
function ValidationBadge({ status }: { status: string | null }) {
  if (!status || status === "unchecked") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    valid: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-red-400",
  };
  const icons: Record<string, React.ReactNode> = {
    valid: <CheckCircle className="h-3.5 w-3.5" />,
    warning: <AlertTriangle className="h-3.5 w-3.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${map[status] ?? ""}`}>
      {icons[status]} {status}
    </span>
  );
}

// ─── Schedule indicator ───────────────────────────────────────────────────────
function ScheduleIndicator({
  videoId,
  scheduleMap,
}: {
  videoId: number;
  scheduleMap: Map<number, { hasSchedule: boolean; allExpired: boolean; anyLive: boolean; anyScheduled: boolean }>;
}) {
  const info = scheduleMap.get(videoId);
  if (!info || !info.hasSchedule) return <span className="text-xs text-muted-foreground">—</span>;
  if (info.allExpired)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-red-400 cursor-default">
            <CalendarX2 className="w-3.5 h-3.5" /> Expired
          </span>
        </TooltipTrigger>
        <TooltipContent>All channel publish windows have expired</TooltipContent>
      </Tooltip>
    );
  if (info.anyScheduled && !info.anyLive)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-blue-400 cursor-default">
            <CalendarClock className="w-3.5 h-3.5" /> Scheduled
          </span>
        </TooltipTrigger>
        <TooltipContent>Scheduled to go live in a future window</TooltipContent>
      </Tooltip>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 cursor-default">
          <CalendarCheck2 className="w-3.5 h-3.5" /> Live window
        </span>
      </TooltipTrigger>
      <TooltipContent>Currently within an active publish window</TooltipContent>
    </Tooltip>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────
type SortKey = "createdAt" | "title" | "publishStatus";
function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────
type PublishStatus = "draft" | "pending" | "approved" | "published" | "archived";

function BulkActionBar({
  selectedCount,
  onDeselect,
  onBulkStatus,
  onBulkAIEnrich,
  isLoading,
  isAILoading,
}: {
  selectedCount: number;
  onDeselect: () => void;
  onBulkStatus: (status: PublishStatus) => void;
  onBulkAIEnrich: () => void;
  isLoading: boolean;
  isAILoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PublishStatus | null>(null);

  const statusOptions: { value: PublishStatus; label: string; color: string }[] = [
    { value: "published", label: "Publish", color: "text-emerald-400" },
    { value: "approved", label: "Approve", color: "text-blue-400" },
    { value: "pending", label: "Set Pending", color: "text-amber-400" },
    { value: "draft", label: "Revert to Draft", color: "text-zinc-400" },
    { value: "archived", label: "Archive", color: "text-red-400" },
  ];

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-4 py-3 min-w-80">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckSquare className="w-4 h-4 text-primary" />
          <span>{selectedCount} selected</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
          onClick={onBulkAIEnrich}
          disabled={isAILoading || isLoading}
        >
          <Sparkles className={`w-3.5 h-3.5 ${isAILoading ? "animate-pulse" : ""}`} />
          {isAILoading ? "Enriching…" : "Bulk AI Enrich"}
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => setOpen((v) => !v)}
            disabled={isLoading}
          >
            Change Status <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          {open && (
            <div className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-44 z-50">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${opt.color}`}
                  onClick={() => {
                    setPendingStatus(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 ml-auto"
          onClick={onDeselect}
          title="Deselect all"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={pendingStatus !== null} onOpenChange={(v) => !v && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              Change the status of <strong>{selectedCount} video{selectedCount !== 1 ? "s" : ""}</strong> to{" "}
              <strong className="text-foreground">{pendingStatus}</strong>? This cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatus) onBulkStatus(pendingStatus);
                setPendingStatus(null);
              }}
            >
              Update {selectedCount} Video{selectedCount !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────
function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      <Tag className="w-3 h-3" />
      {tag}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Videos() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Tag filter data (all available tags, unfiltered)
  const { data: allTagsData } = trpc.videos.allTags.useQuery();
  const allTags = allTagsData ?? [];

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
    setPage(1);
  }, [sortBy]);

  // Server-side filtering — tags, search, status, sort, pagination all go to DB
  const tagsArray = useMemo(() => Array.from(selectedTags), [selectedTags]);

  const { data, isLoading, refetch } = trpc.videos.list.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    tags: tagsArray.length > 0 ? tagsArray : undefined,
    page,
    limit: 20,
    sortBy,
    sortDir,
  });

  const setStatusMutation = trpc.videos.setStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const validateMutation = trpc.videos.validate.useMutation({
    onSuccess: (r) => { toast.success(`Validation: ${r.status}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // ─── AI diff dialog state ────────────────────────────────────────────────────
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffVideo, setDiffVideo] = useState<{ id: number; title: string; original: OriginalValues } | null>(null);
  const [diffSuggestion, setDiffSuggestion] = useState<AISuggestion | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  // ─── Bulk diff review state ───────────────────────────────────────────────────
  const [bulkDiffOpen, setBulkDiffOpen] = useState(false);
  const [bulkDiffSuggestions, setBulkDiffSuggestions] = useState<BulkSuggestion[]>([]);
  const [bulkDiffOriginals, setBulkDiffOriginals] = useState<Record<number, { title: string; description: string | null; tags: string[]; contentRating: string | null; contentType: string | null }>>({});

  const enrichVideoMutation = trpc.ai.enrichVideo.useMutation({
    onSuccess: (r) => {
      setDiffSuggestion(r.result as AISuggestion);
      setDiffError(null);
    },
    onError: (e) => {
      setDiffError(e.message);
    },
  });

  const applyEnrichmentMutation = trpc.ai.applyEnrichment.useMutation({
    onSuccess: () => {
      toast.success("AI enrichment applied");
      setDiffOpen(false);
      setDiffVideo(null);
      setDiffSuggestion(null);
      refetch();
    },
    onError: (e) => toast.error(`Failed to apply: ${e.message}`),
  });

  const bulkEnrichMutation = trpc.ai.bulkEnrich.useMutation({
    onSuccess: (r) => {
      const successResults = r.results?.filter((s) => s.status === "ok") ?? [];
      if (successResults.length > 0) {
        // Build originals map from current page data
        const originalsMap: Record<number, { title: string; description: string | null; tags: string[]; contentRating: string | null; contentType: string | null }> = {};
        for (const item of data?.items ?? []) {
          const parsedTags: string[] = (() => {
            try {
              if (!item.tags) return [];
              const raw = typeof item.tags === "string" ? item.tags : JSON.stringify(item.tags);
              return JSON.parse(raw) as string[];
            } catch { return []; }
          })();
          originalsMap[item.id] = {
            title: item.title,
            description: item.description ?? null,
            tags: parsedTags,
            contentRating: item.contentRating ?? null,
            contentType: item.contentType ?? null,
          };
        }
        setBulkDiffOriginals(originalsMap);
        setBulkDiffSuggestions(r.results as BulkSuggestion[]);
        setBulkDiffOpen(true);
      } else {
        toast.info(r.message ?? "No videos needed enrichment.");
        setSelectedIds(new Set());
      }
    },
    onError: (e) => toast.error(`Bulk AI enrich failed: ${e.message}`),
  });

  const openAIDiff = (video: { id: number; title: string; description: string | null; tags: unknown; contentRating: string | null }) => {
    const parsedTags: string[] = (() => {
      try {
        if (!video.tags) return [];
        const raw = typeof video.tags === "string" ? video.tags : JSON.stringify(video.tags);
        return JSON.parse(raw) as string[];
      } catch { return []; }
    })();
    const original: OriginalValues = {
      title: video.title,
      description: video.description,
      tags: parsedTags,
      contentRating: video.contentRating,
    };
    setDiffVideo({ id: video.id, title: video.title, original });
    setDiffSuggestion(null);
    setDiffError(null);
    setDiffOpen(true);
    enrichVideoMutation.mutate({ videoId: video.id, apply: false });
  };

  const handleBulkAIEnrich = () => {
    bulkEnrichMutation.mutate({ videoIds: Array.from(selectedIds), apply: false });
  };

  const bulkStatusMutation = trpc.videos.bulkUpdateStatus.useMutation({
    onSuccess: (r) => {
      toast.success(`Updated ${r.updatedCount} video${r.updatedCount !== 1 ? "s" : ""}${r.notFoundCount > 0 ? ` (${r.notFoundCount} not found)` : ""}`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e) => toast.error(`Bulk update failed: ${e.message}`),
  });

  // Schedule summary — only for the current page
  const videoIds = useMemo(() => data?.items.map((v) => v.id) ?? [], [data?.items]);
  const { data: scheduleData } = trpc.videos.scheduleSummary.useQuery(
    { videoIds },
    { enabled: videoIds.length > 0 }
  );
  const scheduleMap = useMemo(() => {
    const m = new Map<number, { hasSchedule: boolean; allExpired: boolean; anyLive: boolean; anyScheduled: boolean }>();
    for (const s of scheduleData ?? []) m.set(s.videoId, s);
    return m;
  }, [scheduleData]);

  const pageItems = data?.items ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / 20);

  // ─── Selection helpers ─────────────────────────────────────────────────────
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((v) => selectedIds.has(v.id));
  const someOnPageSelected = pageItems.some((v) => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageItems.forEach((v) => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageItems.forEach((v) => next.add(v.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = (status: PublishStatus) => {
    bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status });
  };

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSelectedTags(new Set());
    setPage(1);
    setSelectedIds(new Set());
  };

  const activeFilterCount = (search ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + selectedTags.size;

  return (
    <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Videos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading…" : (
                <>
                  <span className="font-medium text-foreground">{data?.total ?? 0}</span> video{data?.total !== 1 ? "s" : ""}
                  {activeFilterCount > 0 && (
                    <span className="ml-1 text-primary">
                      ({activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active)
                    </span>
                  )}
                  {selectedIds.size > 0 && (
                    <span className="ml-2 text-primary font-medium">· {selectedIds.size} selected</span>
                  )}
                </>
              )}
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setLocation("/videos/new")}>
            <Plus className="h-4 w-4" /> Add Video
          </Button>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-col gap-2">
          {/* Row 1: search + status + sort + clear */}
          <div className="flex gap-2 flex-wrap items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, slug, description…"
                className="pl-9 h-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); setSelectedIds(new Set()); }}
              />
            </div>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); setSelectedIds(new Set()); }}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort by */}
            <div className="flex items-center gap-1.5 border border-border rounded-md px-2.5 h-9 bg-background shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortKey); setPage(1); }}>
                <SelectTrigger className="border-0 shadow-none p-0 h-auto text-xs w-24 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Date Added</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="publishStatus">Status</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={sortDir === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}
              >
                {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Clear all */}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                onClick={clearAllFilters}
              >
                <X className="w-3.5 h-3.5" /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>

          {/* Row 2: tag chips (only when tags exist) */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium shrink-0 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags:
              </span>
              {allTags.map((tag) => (
                <TagChip
                  key={tag}
                  tag={tag}
                  active={selectedTags.has(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
              {selectedTags.size > 0 && (
                <button
                  onClick={() => { setSelectedTags(new Set()); setPage(1); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                >
                  Clear tags ({selectedTags.size})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Film className="h-8 w-8 mx-auto mb-2 animate-pulse opacity-40" />
                <p className="text-sm">Loading videos…</p>
              </div>
            ) : pageItems.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {activeFilterCount > 0 ? "No videos match your filters" : "No videos yet"}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {activeFilterCount > 0
                    ? "Try adjusting or clearing the filters to see more results."
                    : "Get started by adding your first video or importing a CSV."}
                </p>
                {activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    Clear all filters
                  </Button>
                ) : (
                  <div className="flex gap-2 justify-center">
                    <Button size="sm" onClick={() => setLocation("/videos/new")}>
                      <Plus className="h-4 w-4 mr-1.5" /> Add Video
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLocation("/import")}>
                      Import CSV
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      {/* Select-all checkbox */}
                      <th className="px-3 py-2.5 w-10">
                        <Checkbox
                          checked={allOnPageSelected}
                          data-state={someOnPageSelected && !allOnPageSelected ? "indeterminate" : undefined}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all on page"
                          className="border-border"
                        />
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5 w-12"></th>
                      <th className="text-left px-3 py-2.5">
                        <SortableHeader label="Title" sortKey="title" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5 hidden md:table-cell">Type</th>
                      <th className="text-left px-3 py-2.5">
                        <SortableHeader label="Status" sortKey="publishStatus" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                      </th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5 hidden lg:table-cell">Validation</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5 hidden xl:table-cell">Schedule</th>
                      <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2.5 hidden lg:table-cell">Duration</th>
                      <th className="text-left px-3 py-2.5 hidden xl:table-cell">
                        <SortableHeader label="Added" sortKey="createdAt" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                      </th>
                      <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((video) => {
                      const isSelected = selectedIds.has(video.id);
                      return (
                        <tr
                          key={video.id}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors group ${isSelected ? "bg-primary/5" : ""}`}
                        >
                          {/* Row checkbox */}
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(video.id)}
                              aria-label={`Select ${video.title}`}
                              className="border-border"
                            />
                          </td>
                          {/* Thumbnail */}
                          <td className="px-3 py-2">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="h-7 w-11 object-cover rounded" />
                            ) : (
                              <div className="h-7 w-11 bg-muted rounded flex items-center justify-center">
                                <Film className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </td>
                          {/* Title */}
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground truncate max-w-xs leading-tight">{video.title}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{video.slug}</p>
                          </td>
                          {/* Type */}
                          <td className="px-3 py-2 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground">{video.contentType}</span>
                          </td>
                          {/* Status */}
                          <td className="px-3 py-2">
                            <StatusBadge status={video.publishStatus} />
                          </td>
                          {/* Validation */}
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <ValidationBadge status={video.validationStatus} />
                          </td>
                          {/* Schedule */}
                          <td className="px-3 py-2 hidden xl:table-cell">
                            <ScheduleIndicator videoId={video.id} scheduleMap={scheduleMap} />
                          </td>
                          {/* Duration */}
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground">
                              {video.durationSeconds
                                ? `${Math.floor(video.durationSeconds / 60)}m ${video.durationSeconds % 60}s`
                                : "—"}
                            </span>
                          </td>
                          {/* Added date */}
                          <td className="px-3 py-2 hidden xl:table-cell">
                            <span className="text-xs text-muted-foreground">
                              {video.createdAt ? new Date(video.createdAt).toLocaleDateString() : "—"}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    disabled={enrichVideoMutation.isPending}
                                    onClick={() => openAIDiff(video)}
                                  >
                                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>AI Enrich</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => validateMutation.mutate({ id: video.id })}
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Validate</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setLocation(`/videos/${video.id}`)}
                                  >
                                    <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                              <Select
                                value={video.publishStatus}
                                onValueChange={(v) =>
                                  setStatusMutation.mutate({ id: video.id, status: v as PublishStatus })
                                }
                              >
                                <SelectTrigger className="h-7 w-28 text-xs border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="approved">Approved</SelectItem>
                                  <SelectItem value="published">Published</SelectItem>
                                  <SelectItem value="archived">Archived</SelectItem>
                                </SelectContent>
                              </Select>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
              {data?.total !== undefined && ` · ${data.total} result${data.total !== 1 ? "s" : ""}`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); setSelectedIds(new Set()); }}
              >
                Previous
              </Button>
              {/* Page number buttons (show up to 5 around current) */}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="w-9"
                    onClick={() => { setPage(p); setSelectedIds(new Set()); }}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => { setPage(page + 1); setSelectedIds(new Set()); }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      {/* Floating bulk action bar - only when items are selected */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onDeselect={() => setSelectedIds(new Set())}
          onBulkStatus={handleBulkStatus}
          onBulkAIEnrich={handleBulkAIEnrich}
          isLoading={bulkStatusMutation.isPending}
          isAILoading={bulkEnrichMutation.isPending}
        />
      )}

      {/* Bulk Diff Review Dialog */}
      <BulkDiffReviewDialog
        open={bulkDiffOpen}
        onClose={() => setBulkDiffOpen(false)}
        suggestions={bulkDiffSuggestions}
        originalVideos={bulkDiffOriginals}
        onApplied={() => {
          setSelectedIds(new Set());
          setBulkDiffOpen(false);
          refetch();
        }}
      />

      {/* AI Diff Dialog */}
      {diffVideo && (
        <AIDiffDialog
          open={diffOpen}
          onOpenChange={(v) => { if (!applyEnrichmentMutation.isPending) setDiffOpen(v); }}
          videoTitle={diffVideo.title}
          original={diffVideo.original}
          suggestion={diffSuggestion}
          isLoading={enrichVideoMutation.isPending}
          error={diffError}
          isApplying={applyEnrichmentMutation.isPending}
          onApprove={(approved: ApprovedFields) => {
            applyEnrichmentMutation.mutate({
              videoId: diffVideo.id,
              ...approved,
            });
          }}
          onDiscard={() => {
            setDiffOpen(false);
            setDiffVideo(null);
            setDiffSuggestion(null);
          }}
        />
      )}
    </div>
  );
}
