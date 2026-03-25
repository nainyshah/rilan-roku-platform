/**
 * BulkDiffReviewDialog
 * Shows a paginated diff of all AI-suggested changes from a bulk enrichment run.
 * Users can approve/reject individual fields per video, then apply only approved changes.
 * Displays confidence score badge per video and supports Approve All Fields shortcut.
 */
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertTriangle,
  Loader2,
  Info,
  CheckCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type EnrichResult = {
  title: string;
  description: string;
  tags: string[];
  contentRating: string;
  contentType: string | null;
  reasoning: string;
  confidence?: number;
  streamInferenceHints?: string[];
};

export type BulkSuggestion = {
  videoId: number;
  title: string; // original title
  status: "ok" | "failed";
  result?: EnrichResult;
  error?: string;
};

type FieldApprovals = {
  title: boolean;
  description: boolean;
  tags: boolean;
  contentRating: boolean;
  contentType: boolean;
};

type VideoApproval = {
  approved: boolean; // overall include/exclude
  fields: FieldApprovals;
};

type Props = {
  open: boolean;
  onClose: () => void;
  suggestions: BulkSuggestion[];
  originalVideos: Record<number, { title: string; description: string | null; tags: string[]; contentRating: string | null; contentType: string | null }>;
  onApplied: () => void;
};

const PAGE_SIZE = 1;

// ─── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  let colorClass = "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
  let label = "High";
  if (clamped < 50) {
    colorClass = "border-red-500/40 text-red-400 bg-red-500/10";
    label = "Low";
  } else if (clamped < 75) {
    colorClass = "border-amber-500/40 text-amber-400 bg-amber-500/10";
    label = "Medium";
  }
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${colorClass}`}>
      <Sparkles className="w-3 h-3" />
      {label} · {clamped}%
    </Badge>
  );
}

// ─── Field diff row ────────────────────────────────────────────────────────────
function FieldDiff({
  label,
  original,
  suggested,
  approved,
  onChange,
}: {
  label: string;
  original: string;
  suggested: string;
  approved: boolean;
  onChange: (v: boolean) => void;
}) {
  const changed = original !== suggested;
  return (
    <div className={`rounded-lg border p-3 space-y-2 transition-colors ${approved && changed ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={approved}
            onCheckedChange={(v) => onChange(!!v)}
            disabled={!changed}
            id={`field-${label}`}
          />
          <label htmlFor={`field-${label}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
            {label}
          </label>
          {!changed && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
              No change
            </Badge>
          )}
        </div>
        {changed && (
          approved
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            : <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </div>
      {changed && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">Original</p>
            <p className="text-foreground/70 line-clamp-3 break-words">{original || "(empty)"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-emerald-400 font-medium">AI Suggested</p>
            <p className="text-foreground break-words line-clamp-3">{suggested}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function BulkDiffReviewDialog({ open, onClose, suggestions, originalVideos, onApplied }: Props) {
  const successSuggestions = suggestions.filter((s) => s.status === "ok" && s.result);
  const failedCount = suggestions.filter((s) => s.status === "failed").length;

  // Per-video approval state — default all fields approved
  const [approvals, setApprovals] = useState<Record<number, VideoApproval>>(() => {
    const init: Record<number, VideoApproval> = {};
    for (const s of successSuggestions) {
      init[s.videoId] = {
        approved: true,
        fields: { title: true, description: true, tags: true, contentRating: true, contentType: true },
      };
    }
    return init;
  });

  const [page, setPage] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);

  const totalPages = successSuggestions.length;
  const current = successSuggestions[page];
  const currentOriginal = current ? originalVideos[current.videoId] : null;
  const currentApproval = current ? (approvals[current.videoId] ?? { approved: true, fields: { title: true, description: true, tags: true, contentRating: true, contentType: true } }) : null;

  const approvedCount = useMemo(
    () => Object.values(approvals).filter((a) => a.approved).length,
    [approvals]
  );

  const applyEnrichment = trpc.ai.applyEnrichment.useMutation();

  function setVideoApproval(videoId: number, patch: Partial<VideoApproval>) {
    setApprovals((prev) => ({
      ...prev,
      [videoId]: { ...prev[videoId], ...patch },
    }));
  }

  function setFieldApproval(videoId: number, field: keyof FieldApprovals, value: boolean) {
    setApprovals((prev) => ({
      ...prev,
      [videoId]: {
        ...prev[videoId],
        fields: { ...prev[videoId].fields, [field]: value },
      },
    }));
  }

  function handleApproveAllFields() {
    if (!current) return;
    setApprovals((prev) => ({
      ...prev,
      [current.videoId]: {
        approved: true,
        fields: { title: true, description: true, tags: true, contentRating: true, contentType: true },
      },
    }));
  }

  async function handleApply() {
    const toApply = successSuggestions.filter((s) => approvals[s.videoId]?.approved && s.result);
    if (toApply.length === 0) {
      toast.error("No videos selected for applying changes.");
      return;
    }
    setApplying(true);
    setApplyProgress(0);
    let applied = 0;
    let failed = 0;
    for (const suggestion of toApply) {
      const approval = approvals[suggestion.videoId];
      const result = suggestion.result!;
      const orig = originalVideos[suggestion.videoId];
      try {
        await applyEnrichment.mutateAsync({
          videoId: suggestion.videoId,
          title: approval.fields.title ? result.title : orig.title,
          description: approval.fields.description ? result.description : (orig.description ?? ""),
          tags: approval.fields.tags ? result.tags : orig.tags,
          contentRating: approval.fields.contentRating ? result.contentRating : (orig.contentRating ?? undefined),
        });
        applied++;
      } catch {
        failed++;
      }
      setApplyProgress(Math.round(((applied + failed) / toApply.length) * 100));
    }
    setApplying(false);
    if (failed === 0) {
      toast.success(`Applied AI changes to ${applied} video${applied !== 1 ? "s" : ""}.`);
    } else {
      toast.warning(`Applied ${applied} videos, ${failed} failed.`);
    }
    onApplied();
    onClose();
  }

  if (!current || !currentOriginal || !currentApproval) return null;
  const result = current.result!;
  const origTags = (currentOriginal.tags ?? []).join(", ");
  const sugTags = (result.tags ?? []).join(", ");
  const confidence = result.confidence;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !applying && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                <DialogTitle>Review AI Suggestions</DialogTitle>
              </div>
              <DialogDescription className="mt-1">
                {successSuggestions.length} video{successSuggestions.length !== 1 ? "s" : ""} enriched
                {failedCount > 0 && ` · ${failedCount} failed`}
                {" · "}
                {approvedCount} selected for apply
              </DialogDescription>
            </div>
            {confidence !== undefined && (
              <div className="shrink-0 pt-0.5">
                <ConfidenceBadge score={confidence} />
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Progress bar when applying */}
        {applying && (
          <div className="px-6 py-3 border-b border-border shrink-0 space-y-1">
            <p className="text-xs text-muted-foreground">Applying changes… {applyProgress}%</p>
            <Progress value={applyProgress} className="h-1.5" />
          </div>
        )}

        {/* Pagination header */}
        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={currentApproval.approved}
              onCheckedChange={(v) => setVideoApproval(current.videoId, { approved: !!v })}
              id="video-approved"
            />
            <div>
              <label htmlFor="video-approved" className="text-sm font-medium cursor-pointer line-clamp-1">
                {current.title}
              </label>
              <p className="text-xs text-muted-foreground">Video {page + 1} of {totalPages}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Approve All Fields for current video */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleApproveAllFields}
              disabled={applying}
              className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Approve All
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Field diffs */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-3">
            {/* Stream inference hints */}
            {result.streamInferenceHints && result.streamInferenceHints.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-medium">Stream URL signals used:</p>
                  {result.streamInferenceHints.map((h, i) => (
                    <p key={i} className="text-blue-300/80">{h}</p>
                  ))}
                </div>
              </div>
            )}

            <FieldDiff
              label="Title"
              original={currentOriginal.title}
              suggested={result.title}
              approved={currentApproval.fields.title}
              onChange={(v) => setFieldApproval(current.videoId, "title", v)}
            />
            <FieldDiff
              label="Description"
              original={currentOriginal.description ?? ""}
              suggested={result.description}
              approved={currentApproval.fields.description}
              onChange={(v) => setFieldApproval(current.videoId, "description", v)}
            />
            <FieldDiff
              label="Tags"
              original={origTags}
              suggested={sugTags}
              approved={currentApproval.fields.tags}
              onChange={(v) => setFieldApproval(current.videoId, "tags", v)}
            />
            <FieldDiff
              label="Content Rating"
              original={currentOriginal.contentRating ?? "all"}
              suggested={result.contentRating}
              approved={currentApproval.fields.contentRating}
              onChange={(v) => setFieldApproval(current.videoId, "contentRating", v)}
            />
            {result.contentType && (
              <FieldDiff
                label="Content Type"
                original={currentOriginal.contentType ?? "clip"}
                suggested={result.contentType}
                approved={currentApproval.fields.contentType}
                onChange={(v) => setFieldApproval(current.videoId, "contentType", v)}
              />
            )}

            {/* AI reasoning */}
            {result.reasoning && (
              <>
                <Separator />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground/60">AI Reasoning</p>
                  <p className="leading-relaxed">{result.reasoning}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {failedCount} video{failedCount !== 1 ? "s" : ""} failed enrichment
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying || approvedCount === 0}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Applying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Apply {approvedCount} Video{approvedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
