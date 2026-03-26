/**
 * Settings.tsx
 *
 * Operator settings page for the RILAN Roku Content Platform.
 * Currently exposes:
 *   - Stale-data threshold: how old lastSyncedAt can be before stat cards
 *     show the amber "Stale" warning (1–60 minutes, default 5)
 *   - Health polling info: read-only display of current polling cadences
 *
 * Settings are persisted to localStorage via useStaleThreshold.
 */

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useStaleThreshold } from '@/hooks/useStaleThreshold';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import {
  Settings as SettingsIcon,
  Clock,
  Activity,
  RotateCcw,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const {
    thresholdMinutes,
    setThreshold,
    defaultMinutes,
    minMinutes,
    maxMinutes,
  } = useStaleThreshold();

  const { lastSyncedAt, uptimePct, pollCount } = useSyncStatus();

  // Local draft value — only committed on Save
  const [draft, setDraft] = useState(thresholdMinutes);
  const isDirty = draft !== thresholdMinutes;

  const handleSave = () => {
    setThreshold(draft);
    toast.success(`Stale threshold updated to ${draft} minute${draft !== 1 ? 's' : ''}`);
  };

  const handleReset = () => {
    setDraft(defaultMinutes);
    setThreshold(defaultMinutes);
    toast.info(`Stale threshold reset to default (${defaultMinutes} minutes)`);
  };

  const thresholdLabel = (min: number) => {
    if (min < 2) return 'Very sensitive';
    if (min < 5) return 'Sensitive';
    if (min < 10) return 'Balanced';
    if (min < 20) return 'Relaxed';
    return 'Lenient';
  };

  const thresholdColor = (min: number) => {
    if (min < 2) return 'text-red-400';
    if (min < 5) return 'text-amber-400';
    if (min < 10) return 'text-emerald-400';
    return 'text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure operator preferences for the RILAN platform dashboard.
            </p>
          </div>
        </div>

        {/* ── Stale-data threshold ──────────────────────────────────────── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-amber-400" />
              Stale-Data Warning Threshold
            </CardTitle>
            <CardDescription>
              Controls how long after the last successful health poll before Dashboard stat cards
              display an amber border and "Stale" badge. Increase this if your polling cadence
              is slower than the default 60-second interval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current value display */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Warning after:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground tabular-nums">
                      {draft}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      minute{draft !== 1 ? 's' : ''}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${thresholdColor(draft)} border-current/30`}
                    >
                      {thresholdLabel(draft)}
                    </Badge>
                  </div>
                </div>

                <Slider
                  value={[draft]}
                  onValueChange={([v]) => setDraft(v)}
                  min={minMinutes}
                  max={maxMinutes}
                  step={1}
                  className="w-full"
                />

                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{minMinutes} min</span>
                  <span className="text-xs text-muted-foreground">{maxMinutes} min</span>
                </div>
              </div>
            </div>

            {/* Preset buttons */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 5, 10, 15, 30].map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    className={`text-xs h-7 ${draft === preset ? 'border-primary text-primary bg-primary/10' : ''}`}
                    onClick={() => setDraft(preset)}
                  >
                    {preset} min
                  </Button>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div className="flex gap-2 bg-muted/30 border border-border rounded-lg p-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The background health poll runs every <strong className="text-foreground">60 seconds</strong> and
                the focus-based refetch triggers after <strong className="text-foreground">30 seconds</strong> of
                tab inactivity. Setting the threshold below 2 minutes may cause frequent stale warnings
                during normal operation.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleSave}
                disabled={!isDirty}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save changes
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-2 bg-transparent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to default ({defaultMinutes} min)
              </Button>
              {isDirty && (
                <span className="text-xs text-amber-400 ml-auto">Unsaved changes</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Health polling status ─────────────────────────────────────── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-400" />
              Health Polling Status
            </CardTitle>
            <CardDescription>
              Read-only overview of the current health monitoring state for this session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Last successful sync</p>
                <p className="text-sm font-semibold text-foreground">
                  {lastSyncedAt
                    ? lastSyncedAt.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'Not yet synced'}
                </p>
                {lastSyncedAt && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {lastSyncedAt.toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">24h uptime</p>
                <p className={`text-sm font-semibold ${
                  uptimePct === null ? 'text-muted-foreground' :
                  uptimePct >= 99 ? 'text-emerald-400' :
                  uptimePct >= 90 ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {uptimePct !== null ? `${uptimePct}%` : 'Collecting…'}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {pollCount} check{pollCount !== 1 ? 's' : ''} recorded
                </p>
              </div>

              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Poll cadence</p>
                <p className="text-sm font-semibold text-foreground">60 s background</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  + focus refetch after 30 s hidden
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
