/**
 * UptimeSparkline.tsx
 *
 * A compact 24-hour uptime bar chart rendered inside the Dashboard.
 * Each bar represents one poll outcome from useSyncStatus:
 *   - Green bar  → healthy (ok: true)
 *   - Red bar    → failed  (ok: false)
 *
 * The chart is intentionally minimal — no axes, no labels, no tooltip clutter —
 * so it reads as a visual pulse at a glance. A tooltip on hover reveals the
 * exact timestamp and result for each bar.
 *
 * Data source: the `_pollHistory` array exposed via `usePollHistory()` from
 * useSyncStatus. Bars are bucketed into up to 48 slots (30-min buckets over
 * 24 h) so the chart stays readable even with hundreds of raw entries.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
} from 'recharts';
import { usePollHistory } from '@/hooks/useSyncStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BucketEntry {
  /** Slot label shown on hover, e.g. "14:30" */
  label: string;
  /** 1 = all ok, 0 = all failed, fraction = mixed */
  ratio: number;
  /** Number of raw poll entries in this bucket */
  count: number;
  /** Whether any entry in this bucket was a failure */
  hasFail: boolean;
  /** Whether any entry in this bucket was a success */
  hasOk: boolean;
  /** Bucket start timestamp (ms) */
  ts: number;
}

// ── Bucketing ─────────────────────────────────────────────────────────────────

const BUCKET_MS = 30 * 60 * 1000; // 30-minute buckets
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour window
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS; // 48 buckets

interface RawEntry {
  ts: number;
  ok: boolean;
}

function bucketHistory(history: RawEntry[]): BucketEntry[] {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Build 48 empty buckets aligned to 30-min boundaries
  const buckets: BucketEntry[] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const bucketStart = windowStart + i * BUCKET_MS;
    const d = new Date(bucketStart);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return {
      label: `${h}:${m}`,
      ratio: -1,   // -1 = no data
      count: 0,
      hasFail: false,
      hasOk: false,
      ts: bucketStart,
    };
  });

  // Assign each poll entry to its bucket
  for (const entry of history) {
    if (entry.ts < windowStart || entry.ts > now) continue;
    const idx = Math.min(
      Math.floor((entry.ts - windowStart) / BUCKET_MS),
      BUCKET_COUNT - 1
    );
    const b = buckets[idx];
    b.count++;
    if (entry.ok) b.hasOk = true;
    else b.hasFail = true;
  }

  // Compute ratio for each populated bucket
  for (const b of buckets) {
    if (b.count === 0) {
      b.ratio = -1; // no data
    } else {
      // Mixed bucket: ratio = fraction of ok entries
      // We don't track individual counts, so use hasFail/hasOk heuristic:
      // If both, show as degraded (0.5); if only ok, 1; if only fail, 0
      if (b.hasOk && b.hasFail) b.ratio = 0.5;
      else if (b.hasOk) b.ratio = 1;
      else b.ratio = 0;
    }
  }

  return buckets;
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  payload?: BucketEntry;
}

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const b = payload[0].payload;

  if (b.count === 0) {
    return (
      <div className="bg-popover border border-border rounded px-2 py-1 text-xs text-muted-foreground shadow-md">
        <p className="font-medium">{b.label}</p>
        <p>No data</p>
      </div>
    );
  }

  const statusLabel =
    b.ratio === 1 ? 'Healthy' :
    b.ratio === 0 ? 'Failed' :
    'Degraded (mixed)';

  const statusColor =
    b.ratio === 1 ? 'text-emerald-400' :
    b.ratio === 0 ? 'text-red-400' :
    'text-amber-400';

  return (
    <div className="bg-popover border border-border rounded px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground mb-0.5">{b.label}</p>
      <p className={`font-semibold ${statusColor}`}>{statusLabel}</p>
      <p className="text-muted-foreground">{b.count} check{b.count !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ── Bar colour helper ─────────────────────────────────────────────────────────

function barColor(ratio: number): string {
  if (ratio < 0) return 'hsl(240 5% 26%)';     // no data — muted zinc
  if (ratio === 1) return 'hsl(142 71% 45%)';   // all ok — emerald
  if (ratio === 0) return 'hsl(0 84% 60%)';     // all failed — red
  return 'hsl(38 92% 50%)';                     // mixed — amber
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UptimeSparklineProps {
  /** Override height in px (default 40) */
  height?: number;
  /** Show the "24h uptime history" label above the chart (default true) */
  showLabel?: boolean;
  /** Additional className for the outer wrapper */
  className?: string;
}

export function UptimeSparkline({
  height = 40,
  showLabel = true,
  className = '',
}: UptimeSparklineProps) {
  const history = usePollHistory();
  const buckets = useMemo(() => bucketHistory(history), [history]);

  // Use a fixed bar value of 1 for all buckets — colour encodes the status
  const chartData = buckets.map((b) => ({ ...b, barValue: 1 }));

  const hasAnyData = history.length > 0;

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">24h uptime history</span>
          {!hasAnyData && (
            <span className="text-xs text-muted-foreground/60 italic">Collecting data…</span>
          )}
        </div>
      )}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            barCategoryGap="10%"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            {/* Hidden XAxis to satisfy recharts internals — no visible ticks */}
            <XAxis dataKey="label" hide />

            <Tooltip
              content={<SparklineTooltip />}
              cursor={false}
              wrapperStyle={{ zIndex: 50 }}
            />

            <Bar dataKey="barValue" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={barColor(entry.ratio)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
          OK
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <span className="inline-block w-2 h-2 rounded-sm bg-amber-500" />
          Degraded
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />
          Failed
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'hsl(240 5% 26%)' }} />
          No data
        </span>
      </div>
    </div>
  );
}
