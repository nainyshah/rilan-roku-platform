import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, Mail, ShieldCheck, KeyRound } from "lucide-react";

type LoginStep = "credentials" | "totp";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Password login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [step, setStep] = useState<LoginStep>("credentials");
  const [loginError, setLoginError] = useState("");

  // Magic link state
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.requireTotp) {
        setStep("totp");
        setLoginError("");
        return;
      }
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: (err) => {
      setLoginError(err.message);
    },
  });

  const magicLinkMutation = trpc.auth.requestMagicLink.useMutation({
    onSuccess: () => {
      setMagicSent(true);
      setMagicError("");
    },
    onError: (err) => {
      setMagicError(err.message);
    },
  });

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    loginMutation.mutate({
      email,
      password,
      totpToken: step === "totp" ? totpToken : undefined,
    });
  };

  const handleMagicLink = (e: React.FormEvent) => {
    e.preventDefault();
    setMagicError("");
    magicLinkMutation.mutate({ email: magicEmail, origin: window.location.origin });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">RILAN Roku Platform</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {step === "totp" ? "Two-Factor Authentication" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {step === "totp"
                ? "Enter the 6-digit code from your authenticator app."
                : "Enter your credentials to access the platform."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === "totp" ? (
              /* ── TOTP Step ── */
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {loginError && (
                  <Alert variant="destructive">
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="totp">Authenticator Code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="totp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={totpToken}
                      onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ""))}
                      className="pl-10 text-center tracking-widest text-lg font-mono"
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending || totpToken.length !== 6}
                >
                  {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => { setStep("credentials"); setTotpToken(""); setLoginError(""); }}
                >
                  ← Back to login
                </Button>
              </form>
            ) : (
              /* ── Credentials + Magic Link Tabs ── */
              <Tabs defaultValue="password">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
                  <TabsTrigger value="magic" className="flex-1">Magic Link</TabsTrigger>
                </TabsList>

                {/* Password Tab */}
                <TabsContent value="password">
                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    {loginError && (
                      <Alert variant="destructive">
                        <AlertDescription>{loginError}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="admin@rilan.local"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10"
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                          required
                          autoComplete="current-password"
                          minLength={6}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Sign In
                    </Button>
                  </form>
                </TabsContent>

                {/* Magic Link Tab */}
                <TabsContent value="magic">
                  {magicSent ? (
                    <div className="text-center space-y-3 py-4">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20">
                        <Mail className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="font-medium">Check your email</p>
                      <p className="text-sm text-muted-foreground">
                        A magic link has been sent to <strong>{magicEmail}</strong>. It expires in 15 minutes.
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => { setMagicSent(false); setMagicEmail(""); }}>
                        Send another
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleMagicLink} className="space-y-4">
                      {magicError && (
                        <Alert variant="destructive">
                          <AlertDescription>{magicError}</AlertDescription>
                        </Alert>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="magic-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="magic-email"
                            type="email"
                            placeholder="your@email.com"
                            value={magicEmail}
                            onChange={(e) => setMagicEmail(e.target.value)}
                            className="pl-10"
                            required
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={magicLinkMutation.isPending}
                      >
                        {magicLinkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Send Magic Link
                      </Button>
                    </form>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Access is restricted to authorised users only.
        </p>
      </div>
    </div>
  );
}
