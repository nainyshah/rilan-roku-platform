/**
 * AIDiffDialog — shows original vs AI-suggested metadata side-by-side.
 * The user can toggle individual fields on/off before applying.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AISuggestion {
  title: string;
  description: string;
  tags: string[];
  contentRating: string;
  reasoning: string;
}

export interface OriginalValues {
  title: string;
  description: string | null;
  tags: string[];
  contentRating: string | null;
}

export interface ApprovedFields {
  title: string;
  description: string;
  tags: string[];
  contentRating: string;
}

interface AIDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoTitle: string;
  original: OriginalValues;
  suggestion: AISuggestion | null;
  isLoading: boolean;
  error: string | null;
  isApplying: boolean;
  onApprove: (approved: ApprovedFields) => void;
  onDiscard: () => void;
}

// ─── Diff field component ─────────────────────────────────────────────────────

function DiffField({
  label,
  original,
  suggested,
  enabled,
  onToggle,
  multiline = false,
}: {
  label: string;
  original: string;
  suggested: string;
  enabled: boolean;
  onToggle: () => void;
  multiline?: boolean;
}) {
  const changed = original.trim() !== suggested.trim();

  return (
    <div className={`rounded-lg border p-3 transition-colors ${enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`diff-${label}`}
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={!changed}
          />
          <label
            htmlFor={`diff-${label}`}
            className={`text-xs font-semibold uppercase tracking-wide cursor-pointer ${enabled ? "text-foreground" : "text-muted-foreground"}`}
          >
            {label}
          </label>
        </div>
        {changed ? (
          <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
            Changed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            Same
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Original */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Original</p>
          <div className={`rounded p-2 text-xs bg-muted/30 border border-border ${multiline ? "min-h-16" : ""}`}>
            {original || <span className="text-muted-foreground italic">(empty)</span>}
          </div>
        </div>
        {/* Suggested */}
        <div>
          <p className="text-xs text-primary mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI Suggestion
          </p>
          <div className={`rounded p-2 text-xs border ${changed ? "bg-primary/10 border-primary/30 text-foreground" : "bg-muted/30 border-border"} ${multiline ? "min-h-16" : ""}`}>
            {suggested || <span className="text-muted-foreground italic">(empty)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tags diff ────────────────────────────────────────────────────────────────

function TagsDiffField({
  original,
  suggested,
  enabled,
  onToggle,
}: {
  original: string[];
  suggested: string[];
  enabled: boolean;
  onToggle: () => void;
}) {
  const added = suggested.filter((t) => !original.includes(t));
  const removed = original.filter((t) => !suggested.includes(t));
  const kept = original.filter((t) => suggested.includes(t));
  const changed = added.length > 0 || removed.length > 0;

  return (
    <div className={`rounded-lg border p-3 transition-colors ${enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="diff-tags"
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={!changed}
          />
          <label
            htmlFor="diff-tags"
            className={`text-xs font-semibold uppercase tracking-wide cursor-pointer ${enabled ? "text-foreground" : "text-muted-foreground"}`}
          >
            Tags
          </label>
        </div>
        {changed ? (
          <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
            Changed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            Same
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Original ({original.length})</p>
          <div className="flex flex-wrap gap-1 rounded p-2 bg-muted/30 border border-border min-h-10">
            {original.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">(none)</span>
            ) : (
              original.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${
                    removed.includes(t)
                      ? "bg-red-500/15 text-red-400 border-red-500/30 line-through"
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}
                >
                  {t}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-primary mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI Suggestion ({suggested.length})
          </p>
          <div className="flex flex-wrap gap-1 rounded p-2 bg-primary/10 border border-primary/30 min-h-10">
            {suggested.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">(none)</span>
            ) : (
              suggested.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${
                    added.includes(t)
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : kept.includes(t)
                      ? "bg-muted/50 text-muted-foreground border-border"
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}
                >
                  {t}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {changed && (
        <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
          {added.length > 0 && (
            <span className="text-emerald-400">+{added.length} added</span>
          )}
          {added.length > 0 && removed.length > 0 && <span>·</span>}
          {removed.length > 0 && (
            <span className="text-red-400">-{removed.length} removed</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export default function AIDiffDialog({
  open,
  onOpenChange,
  videoTitle,
  original,
  suggestion,
  isLoading,
  error,
  isApplying,
  onApprove,
  onDiscard,
}: AIDiffDialogProps) {
  const [useTitle, setUseTitle] = useState(true);
  const [useDescription, setUseDescription] = useState(true);
  const [useTags, setUseTags] = useState(true);
  const [useRating, setUseRating] = useState(false); // off by default — rating changes are sensitive

  const handleApprove = () => {
    if (!suggestion) return;
    onApprove({
      title: useTitle ? suggestion.title : (original.title || ""),
      description: useDescription ? suggestion.description : (original.description || ""),
      tags: useTags ? suggestion.tags : original.tags,
      contentRating: useRating ? suggestion.contentRating : (original.contentRating || "all"),
    });
  };

  const anyFieldEnabled = useTitle || useDescription || useTags || useRating;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isApplying) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Enrichment Review
          </DialogTitle>
          <DialogDescription className="text-sm">
            Review AI suggestions for <strong className="text-foreground">{videoTitle}</strong>. Toggle fields to include or exclude them before applying.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating AI suggestions…</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <p className="text-sm text-destructive font-medium">AI enrichment failed</p>
              <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
            </div>
          )}

          {suggestion && !isLoading && (
            <div className="space-y-3 py-2">
              {/* Reasoning */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <p className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> AI Reasoning
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.reasoning}</p>
              </div>

              <DiffField
                label="Title"
                original={original.title}
                suggested={suggestion.title}
                enabled={useTitle}
                onToggle={() => setUseTitle((v) => !v)}
              />

              <DiffField
                label="Description"
                original={original.description || ""}
                suggested={suggestion.description}
                enabled={useDescription}
                onToggle={() => setUseDescription((v) => !v)}
                multiline
              />

              <TagsDiffField
                original={original.tags}
                suggested={suggestion.tags}
                enabled={useTags}
                onToggle={() => setUseTags((v) => !v)}
              />

              <DiffField
                label="Content Rating"
                original={original.contentRating || "all"}
                suggested={suggestion.contentRating}
                enabled={useRating}
                onToggle={() => setUseRating((v) => !v)}
              />
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={onDiscard}
            disabled={isApplying || isLoading}
            className="text-muted-foreground"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            Discard
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!suggestion || isApplying || isLoading || !anyFieldEnabled}
            className="gap-1.5"
          >
            {isApplying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {isApplying ? "Applying…" : "Apply Selected Fields"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
