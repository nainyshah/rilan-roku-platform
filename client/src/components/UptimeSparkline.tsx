/**
 * UptimeSparkline.tsx
 *
 * A compact 24-hour uptime bar chart rendered inside the Dashboard.
 * Each bar represents one 30-minute bucket of poll outcomes:
 *   - Green  → all checks healthy
 *   - Amber  → mixed (some ok, some failed)
 *   - Red    → all checks failed
 *   - Grey   → no data
 *
 * Clicking a bar opens the SparklineDrillDown slide-over panel showing
 * the raw poll entries (timestamp, status, latency) for that bucket.
 */

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
} from 'recharts';
import { usePollHistory } from '@/hooks/useSyncStatus';
import type { PollEntry } from '@/hooks/useSyncStatus';
import { SparklineDrillDown } from '@/components/SparklineDrillDown';
import type { DrillDownBucket } from '@/components/SparklineDrillDown';

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET_MS = 30 * 60 * 1000;   // 30 min
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS; // 48 buckets

// ── Types ─────────────────────────────────────────────────────────────────────

interface BucketEntry {
  label: string;
  ratio: number;
  count: number;
  hasFail: boolean;
  hasOk: boolean;
  ts: number;
  entries: PollEntry[];   // raw poll entries in this bucket (for drill-down)
}

// ── Bucketing ─────────────────────────────────────────────────────────────────

function bucketHistory(history: PollEntry[]): BucketEntry[] {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const buckets: BucketEntry[] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const bucketStart = windowStart + i * BUCKET_MS;
    const d = new Date(bucketStart);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return {
      label: `${h}:${m}`,
      ratio: -1,
      count: 0,
      hasFail: false,
      hasOk: false,
      ts: bucketStart,
      entries: [],
    };
  });

  for (const entry of history) {
    if (entry.ts < windowStart || entry.ts > now) continue;
    const idx = Math.min(
      Math.floor((entry.ts - windowStart) / BUCKET_MS),
      BUCKET_COUNT - 1
    );
    const b = buckets[idx];
    b.count++;
    b.entries.push(entry);
    if (entry.ok) b.hasOk = true;
    else b.hasFail = true;
  }

  for (const b of buckets) {
    if (b.count === 0) {
      b.ratio = -1;
    } else if (b.hasOk && b.hasFail) {
      b.ratio = 0.5;
    } else if (b.hasOk) {
      b.ratio = 1;
    } else {
      b.ratio = 0;
    }
  }

  return buckets;
}

// ── Bar colour ────────────────────────────────────────────────────────────────

function barColor(ratio: number): string {
  if (ratio < 0) return 'hsl(240 5% 26%)';
  if (ratio === 1) return 'hsl(142 71% 45%)';
  if (ratio === 0) return 'hsl(0 84% 60%)';
  return 'hsl(38 92% 50%)';
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload { payload?: BucketEntry }

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const b = payload[0].payload;

  if (b.count === 0) {
    return (
      <div className="bg-popover border border-border rounded px-2 py-1 text-xs text-muted-foreground shadow-md">
        <p className="font-medium">{b.label}</p>
        <p>No data · Click to inspect</p>
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
      <p className="text-muted-foreground/60 mt-0.5">Click to inspect</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UptimeSparklineProps {
  height?: number;
  showLabel?: boolean;
  className?: string;
}

export function UptimeSparkline({
  height = 40,
  showLabel = true,
  className = '',
}: UptimeSparklineProps) {
  const history = usePollHistory();
  const buckets = useMemo(() => bucketHistory(history), [history]);
  const chartData = buckets.map((b) => ({ ...b, barValue: 1 }));
  const hasAnyData = history.length > 0;

  // ── Drill-down state ────────────────────────────────────────────────────────
  const [selectedBucket, setSelectedBucket] = useState<DrillDownBucket | null>(null);

  const handleBarClick = (data: { activePayload?: { payload: BucketEntry }[] }) => {
    if (!data?.activePayload?.length) return;
    const b = data.activePayload[0].payload;
    setSelectedBucket({
      label: b.label,
      ts: b.ts,
      entries: b.entries,
    });
  };

  return (
    <>
      <div className={`w-full ${className}`}>
        {showLabel && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              24h uptime history
              <span className="text-muted-foreground/50 ml-1">(click a bar to inspect)</span>
            </span>
            {!hasAnyData && (
              <span className="text-xs text-muted-foreground/60 italic">Collecting data…</span>
            )}
          </div>
        )}

        <div style={{ height }} className="cursor-pointer">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              barCategoryGap="10%"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              onClick={handleBarClick}
            >
              <XAxis dataKey="label" hide />
              <Tooltip
                content={<SparklineTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
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
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />OK
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500" />Degraded
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />Failed
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'hsl(240 5% 26%)' }} />No data
          </span>
        </div>
      </div>

      {/* Drill-down slide-over */}
      <SparklineDrillDown
        bucket={selectedBucket}
        onClose={() => setSelectedBucket(null)}
      />
    </>
  );
}
