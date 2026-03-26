/**
 * SparklineDrillDown.tsx
 *
 * A slide-over Sheet panel that opens when an operator clicks a bar in the
 * UptimeSparkline chart. It shows the raw poll entries for the selected
 * 30-minute bucket, including:
 *   - Exact timestamp (local time)
 *   - Status (OK / Failed)
 *   - Response time in ms (when available)
 *
 * Also shows aggregate stats for the bucket: total checks, success rate,
 * average latency, and min/max latency.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Activity, Wifi, WifiOff } from 'lucide-react';
import type { PollEntry } from '@/hooks/useSyncStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DrillDownBucket {
  /** Human-readable label, e.g. "14:30" */
  label: string;
  /** Bucket start timestamp (ms) */
  ts: number;
  /** All raw poll entries that fall within this 30-min bucket */
  entries: PollEntry[];
}

interface SparklineDrillDownProps {
  bucket: DrillDownBucket | null;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function latencyColor(ms: number): string {
  if (ms < 200) return 'text-emerald-400';
  if (ms < 800) return 'text-amber-400';
  return 'text-red-400';
}

function latencyLabel(ms: number): string {
  if (ms < 200) return 'Fast';
  if (ms < 800) return 'Normal';
  return 'Slow';
}

// ── Aggregate stats ───────────────────────────────────────────────────────────

interface BucketStats {
  total: number;
  ok: number;
  failed: number;
  successRate: number;
  avgLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
}

function computeStats(entries: PollEntry[]): BucketStats {
  const total = entries.length;
  const ok = entries.filter((e) => e.ok).length;
  const failed = total - ok;
  const successRate = total > 0 ? Math.round((ok / total) * 100) : 0;

  const withLatency = entries.filter((e) => e.latencyMs !== undefined) as (PollEntry & { latencyMs: number })[];
  const avgLatency = withLatency.length > 0
    ? Math.round(withLatency.reduce((s, e) => s + e.latencyMs, 0) / withLatency.length)
    : null;
  const minLatency = withLatency.length > 0 ? Math.min(...withLatency.map((e) => e.latencyMs)) : null;
  const maxLatency = withLatency.length > 0 ? Math.max(...withLatency.map((e) => e.latencyMs)) : null;

  return { total, ok, failed, successRate, avgLatency, minLatency, maxLatency };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SparklineDrillDown({ bucket, onClose }: SparklineDrillDownProps) {
  const isOpen = bucket !== null;
  const entries = bucket?.entries ?? [];
  const stats = computeStats(entries);

  const bucketEnd = bucket ? bucket.ts + 30 * 60 * 1000 : 0;
  const dateLabel = bucket ? formatDate(bucket.ts) : '';
  const timeRange = bucket
    ? `${new Date(bucket.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – ${new Date(bucketEnd).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[480px] bg-card border-l border-border overflow-y-auto"
      >
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Bucket Detail
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {dateLabel} · {timeRange}
          </SheetDescription>
        </SheetHeader>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No polls recorded</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              No health checks were made during this 30-minute window.
            </p>
          </div>
        ) : (
          <div className="space-y-5 pt-5">
            {/* ── Aggregate stats ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Total checks</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Success rate</p>
                <p className={`text-xl font-bold ${
                  stats.successRate === 100 ? 'text-emerald-400' :
                  stats.successRate >= 50 ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {stats.successRate}%
                </p>
              </div>
              {stats.avgLatency !== null && (
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Avg latency</p>
                  <p className={`text-xl font-bold ${latencyColor(stats.avgLatency)}`}>
                    {stats.avgLatency} ms
                  </p>
                </div>
              )}
              {stats.minLatency !== null && stats.maxLatency !== null && (
                <div className="bg-muted/40 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Latency range</p>
                  <p className="text-sm font-semibold text-foreground">
                    {stats.minLatency}–{stats.maxLatency} ms
                  </p>
                </div>
              )}
            </div>

            {/* ── Status pills ────────────────────────────────────────── */}
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">{stats.ok} OK</span>
              </div>
              {stats.failed > 0 && (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1">
                  <XCircle className="h-3 w-3 text-red-400" />
                  <span className="text-xs font-medium text-red-400">{stats.failed} Failed</span>
                </div>
              )}
            </div>

            {/* ── Raw poll entries ─────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Poll timeline
              </p>
              <div className="space-y-1.5">
                {[...entries].reverse().map((entry, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                      entry.ok
                        ? 'bg-emerald-500/5 border-emerald-500/15'
                        : 'bg-red-500/5 border-red-500/15'
                    }`}
                  >
                    {/* Status icon */}
                    {entry.ok ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}

                    {/* Timestamp */}
                    <span className="text-xs font-mono text-foreground/80 tabular-nums">
                      {formatTime(entry.ts)}
                    </span>

                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 h-5 ${
                        entry.ok
                          ? 'border-emerald-500/30 text-emerald-400'
                          : 'border-red-500/30 text-red-400'
                      }`}
                    >
                      {entry.ok ? 'OK' : 'Failed'}
                    </Badge>

                    {/* Latency */}
                    {entry.latencyMs !== undefined ? (
                      <span className={`ml-auto text-xs font-mono tabular-nums ${latencyColor(entry.latencyMs)}`}>
                        {entry.latencyMs} ms
                        <span className="text-muted-foreground/50 ml-1 font-sans not-italic">
                          ({latencyLabel(entry.latencyMs)})
                        </span>
                      </span>
                    ) : (
                      <span className="ml-auto text-xs text-muted-foreground/40">—</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
