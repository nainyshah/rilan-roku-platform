import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldOff, KeyRound, CheckCircle2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function SetupTotp() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState("");
  const [setupDone, setSetupDone] = useState(false);
  const [disableDone, setDisableDone] = useState(false);

  const meQuery = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const totpEnabled = meQuery.data?.totpEnabled;

  // setupTotp is a mutation (generates secret + QR) — call it once on mount
  const setupMutation = trpc.auth.setupTotp.useMutation();

  const verifyMutation = trpc.auth.verifyTotpSetup.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setSetupDone(true);
    },
    onError: (err: { message: string }) => setError(err.message),
  });

  const disableMutation = trpc.auth.disableTotp.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setDisableDone(true);
    },
    onError: (err: { message: string }) => setDisableError(err.message),
  });

  const handleStartSetup = () => {
    setError("");
    setupMutation.mutate(undefined);
  };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Two-Factor Authentication
              </CardTitle>
              <Badge variant={totpEnabled ? "default" : "secondary"}>
                {totpEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <CardDescription>
              Protect your account with an authenticator app (Google Authenticator, Authy, etc.).
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* ── TOTP Already Enabled ── */}
            {totpEnabled && (
              <div className="space-y-5">
                {disableDone ? (
                  <div className="text-center space-y-3 py-6">
                    <ShieldOff className="w-12 h-12 text-orange-500 mx-auto" />
                    <p className="font-medium">2FA has been disabled.</p>
                    <Button variant="outline" onClick={() => { setDisableDone(false); utils.auth.me.invalidate(); }}>
                      Re-enable 2FA
                    </Button>
                  </div>
                ) : (
                  <>
                    <Alert>
                      <ShieldCheck className="w-4 h-4" />
                      <AlertDescription>
                        Two-factor authentication is active. You will be prompted for a code on each login.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                      <Label htmlFor="disable-password">Enter your password to disable 2FA</Label>
                      <Input
                        id="disable-password"
                        type="password"
                        placeholder="Current password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      {disableError && (
                        <p className="text-xs text-destructive">{disableError}</p>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={disableMutation.isPending || !disablePassword}
                      onClick={() => disableMutation.mutate({ password: disablePassword })}
                    >
                      {disableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Disable 2FA
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ── TOTP Setup Flow ── */}
            {!totpEnabled && (
              <div className="space-y-5">
                {setupDone ? (
                  <div className="text-center space-y-3 py-6">
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                    <p className="font-medium text-green-600">2FA enabled successfully!</p>
                    <p className="text-sm text-muted-foreground">Your account is now protected.</p>
                    <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
                  </div>
                ) : !setupMutation.data ? (
                  /* Step 1: Start setup */
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Click below to generate a QR code you can scan with your authenticator app.
                    </p>
                    <Button
                      className="w-full"
                      onClick={handleStartSetup}
                      disabled={setupMutation.isPending}
                    >
                      {setupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Set Up Authenticator App
                    </Button>
                    {setupMutation.error && (
                      <p className="text-xs text-destructive">{setupMutation.error.message}</p>
                    )}
                  </div>
                ) : (
                  /* Step 2: Scan QR + verify */
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
                    </p>

                    {/* QR Code */}
                    <div className="flex justify-center">
                      <div className="p-3 bg-white rounded-xl border border-border">
                        <img
                          src={setupMutation.data.qrDataUrl}
                          alt="TOTP QR Code"
                          className="w-48 h-48"
                        />
                      </div>
                    </div>

                    {/* Manual entry secret */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground text-center">
                        Can't scan? Enter this key manually:
                      </p>
                      <code className="block text-center text-sm font-mono bg-muted px-3 py-2 rounded-md tracking-widest select-all">
                        {setupMutation.data.secret}
                      </code>
                    </div>

                    {/* Verification */}
                    <div className="space-y-2">
                      <Label htmlFor="totp-verify">Verification Code</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="totp-verify"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          value={token}
                          onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                          className="pl-10 font-mono tracking-widest text-center text-lg"
                          autoFocus
                        />
                      </div>
                      {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>

                    <Button
                      className="w-full"
                      disabled={verifyMutation.isPending || token.length !== 6}
                      onClick={() => verifyMutation.mutate({ token })}
                    >
                      {verifyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Enable 2FA
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
                ← Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
