/**
 * Settings.tsx
 *
 * Operator settings page for the RILAN Roku Content Platform.
 * Exposes two configurable preferences:
 *
 *   1. Stale-data threshold — how old lastSyncedAt can be before stat cards
 *      show the amber "Stale" warning (1–60 minutes, default 5).
 *
 *   2. Health-poll interval — how frequently the background health ping
 *      runs (10 s – 300 s, default 60 s). Changes take effect immediately
 *      without a page reload.
 *
 * Both settings are persisted to localStorage via their respective hooks.
 */

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStaleThreshold } from '@/hooks/useStaleThreshold';
import { usePollInterval, POLL_INTERVAL_PRESETS } from '@/hooks/usePollInterval';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { trpc } from '@/lib/trpc';
import {
  Settings as SettingsIcon,
  Clock,
  Activity,
  RotateCcw,
  CheckCircle2,
  Info,
  Wifi,
  Zap,
  KeyRound,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function staleThresholdLabel(min: number): string {
  if (min < 2)  return 'Very sensitive';
  if (min < 5)  return 'Sensitive';
  if (min < 10) return 'Balanced';
  if (min < 20) return 'Relaxed';
  return 'Lenient';
}

function staleThresholdColor(min: number): string {
  if (min < 2)  return 'text-red-400';
  if (min < 5)  return 'text-amber-400';
  if (min < 10) return 'text-emerald-400';
  return 'text-muted-foreground';
}

function pollIntervalLabel(sec: number): string {
  if (sec <= 15)  return 'Aggressive';
  if (sec <= 30)  return 'Fast';
  if (sec <= 60)  return 'Balanced';
  if (sec <= 120) return 'Relaxed';
  return 'Minimal';
}

function pollIntervalColor(sec: number): string {
  if (sec <= 15)  return 'text-red-400';
  if (sec <= 30)  return 'text-amber-400';
  if (sec <= 60)  return 'text-emerald-400';
  return 'text-muted-foreground';
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  // ── Stale threshold ──────────────────────────────────────────────────────
  const {
    thresholdMinutes,
    setThreshold,
    defaultMinutes,
    minMinutes,
    maxMinutes,
  } = useStaleThreshold();

  const [staleDraft, setStaleDraft] = useState(thresholdMinutes);
  const isStaleDirty = staleDraft !== thresholdMinutes;

  const handleStaleSave = () => {
    setThreshold(staleDraft);
    toast.success(`Stale threshold updated to ${staleDraft} minute${staleDraft !== 1 ? 's' : ''}`);
  };

  const handleStaleReset = () => {
    setStaleDraft(defaultMinutes);
    setThreshold(defaultMinutes);
    toast.info(`Stale threshold reset to default (${defaultMinutes} minutes)`);
  };

  // ── Poll interval ────────────────────────────────────────────────────────
  const {
    intervalSeconds,
    setInterval: setPollIntervalValue,
    reset: resetPollInterval,
    isDefault: isPollDefault,
    minSeconds,
    maxSeconds,
    defaultSeconds,
  } = usePollInterval();

  // Draft value — committed immediately (live-reactive, no Save button needed)
  const [pollDraft, setPollDraft] = useState(intervalSeconds);

  const handlePollChange = (seconds: number) => {
    setPollDraft(seconds);
    setPollIntervalValue(seconds);
    // Toast only when the value actually changed
    if (seconds !== intervalSeconds) {
      toast.success(
        `Poll interval updated to ${formatSeconds(seconds)} — timer restarted`,
        { duration: 2500 },
      );
    }
  };

  const handlePollReset = () => {
    setPollDraft(defaultSeconds);
    resetPollInterval();
    toast.info(`Poll interval reset to default (${formatSeconds(defaultSeconds)})`);
  };

  // ── Health polling status ────────────────────────────────────────────────
  const { lastSyncedAt, uptimePct, pollCount } = useSyncStatus();

  // ── Set-password for OAuth accounts ────────────────────────────────────────
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [setPwdError, setSetPwdError] = useState('');
  const utils = trpc.useUtils();

  const setPasswordMutation = trpc.auth.setPassword.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setNewPwd('');
      setConfirmPwd('');
      setSetPwdError('');
      toast.success('Password set successfully. You can now log in with email + password.');
    },
    onError: (err) => setSetPwdError(err.message),
  });

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setSetPwdError('');
    if (newPwd !== confirmPwd) {
      setSetPwdError('Passwords do not match.');
      return;
    }
    setPasswordMutation.mutate({ newPassword: newPwd });
  };

  // Show the set-password card only for accounts with no password yet
  // (loginMethod is 'google' or similar and passwordHash is absent from the safe projection)
  // We detect this by checking if the user has no passwordHash via the me query
  const meQuery = trpc.auth.me.useQuery();
  const hasNoPassword = meQuery.data && !(meQuery.data as any).passwordHash;
  // The safe projection doesn't expose passwordHash — we infer from loginMethod
  const isOAuthOnly = meQuery.data && (meQuery.data as any).loginMethod &&
    (meQuery.data as any).loginMethod !== 'password';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure operator preferences for the RILAN platform dashboard.
            </p>
          </div>
        </div>

        {/* ── Health-poll interval ──────────────────────────────────────── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-4 w-4 text-emerald-400" />
              Health-Poll Interval
            </CardTitle>
            <CardDescription>
              Controls how frequently the background health ping hits{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/health</code> to
              detect server restarts and keep the uptime sparkline accurate. Changes take
              effect immediately — no page reload required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current value display */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Poll every:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground tabular-nums">
                      {formatSeconds(pollDraft)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${pollIntervalColor(pollDraft)} border-current/30`}
                    >
                      {pollIntervalLabel(pollDraft)}
                    </Badge>
                    {!isPollDefault && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">
                        Custom
                      </Badge>
                    )}
                  </div>
                </div>

                <Slider
                  value={[pollDraft]}
                  onValueChange={([v]) => setPollDraft(v)}
                  onValueCommit={([v]) => handlePollChange(v)}
                  min={minSeconds}
                  max={maxSeconds}
                  step={5}
                  className="w-full"
                />

                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{formatSeconds(minSeconds)}</span>
                  <span className="text-xs text-muted-foreground/50">drag to adjust</span>
                  <span className="text-xs text-muted-foreground">{formatSeconds(maxSeconds)}</span>
                </div>
              </div>
            </div>

            {/* Preset buttons */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-2">
                {POLL_INTERVAL_PRESETS.map((preset) => (
                  <Button
                    key={preset.seconds}
                    variant="outline"
                    size="sm"
                    title={preset.description}
                    className={`text-xs h-7 ${
                      pollDraft === preset.seconds
                        ? 'border-primary text-primary bg-primary/10'
                        : ''
                    }`}
                    onClick={() => handlePollChange(preset.seconds)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Live indicator */}
            <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <Zap className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-emerald-400">Live-reactive.</span>{' '}
                The background timer restarts immediately when you change this value — the
                next ping will fire in{' '}
                <strong className="text-foreground">{formatSeconds(pollDraft)}</strong>.
                The focus-based refetch (triggered after 30 s of tab inactivity) is unaffected.
              </div>
            </div>

            {/* Server-load warning for aggressive intervals */}
            {pollDraft < 30 && (
              <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/80 leading-relaxed">
                  Intervals below 30 s increase server load. Use only for active incident
                  monitoring and revert to 60 s or higher during normal operation.
                </p>
              </div>
            )}

            {/* Reset button */}
            {!isPollDefault && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={handlePollReset}
                  className="gap-2 bg-transparent"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to default ({formatSeconds(defaultSeconds)})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
              is slower than the current interval above.
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
                      {staleDraft}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      minute{staleDraft !== 1 ? 's' : ''}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${staleThresholdColor(staleDraft)} border-current/30`}
                    >
                      {staleThresholdLabel(staleDraft)}
                    </Badge>
                  </div>
                </div>

                <Slider
                  value={[staleDraft]}
                  onValueChange={([v]) => setStaleDraft(v)}
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
                    className={`text-xs h-7 ${
                      staleDraft === preset ? 'border-primary text-primary bg-primary/10' : ''
                    }`}
                    onClick={() => setStaleDraft(preset)}
                  >
                    {preset} min
                  </Button>
                ))}
              </div>
            </div>

            {/* Info note — shows current poll interval dynamically */}
            <div className="flex gap-2 bg-muted/30 border border-border rounded-lg p-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The background health poll currently runs every{' '}
                <strong className="text-foreground">{formatSeconds(intervalSeconds)}</strong> and
                the focus-based refetch triggers after{' '}
                <strong className="text-foreground">30 seconds</strong> of tab inactivity.
                Setting the threshold below{' '}
                <strong className="text-foreground">
                  {Math.ceil(intervalSeconds / 60) + 1} minutes
                </strong>{' '}
                may cause frequent stale warnings during normal operation.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleStaleSave}
                disabled={!isStaleDirty}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save changes
              </Button>
              <Button
                variant="outline"
                onClick={handleStaleReset}
                className="gap-2 bg-transparent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to default ({defaultMinutes} min)
              </Button>
              {isStaleDirty && (
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
              Live overview of the current health monitoring state for this session.
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
                <p className="text-sm font-semibold text-foreground">
                  {formatSeconds(intervalSeconds)} background
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  + focus refetch after 30 s hidden
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Set Password (OAuth-only accounts) ──────────────────────────── */}
        {isOAuthOnly && (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" />
                Set a Password
              </CardTitle>
              <CardDescription>
                Your account was created via Google OAuth and has no password yet. Setting one
                lets you also sign in with email + password from any device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetPassword} className="space-y-4 max-w-sm">
                {setPwdError && (
                  <Alert variant="destructive">
                    <AlertDescription>{setPwdError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-pwd">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="new-pwd"
                      type="password"
                      placeholder="••••••••"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pwd">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirm-pwd"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={setPasswordMutation.isPending || !newPwd || !confirmPwd}
                >
                  {setPasswordMutation.isPending
                    ? <span className="animate-spin mr-1">&#9696;</span>
                    : <CheckCircle2 className="h-4 w-4" />}
                  Set password
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
