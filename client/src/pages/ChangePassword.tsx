import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle2, Eye, EyeOff } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "At least 6 characters", pass: password.length >= 6 },
    { label: "Contains uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Contains number", pass: /\d/.test(password) },
    { label: "Contains special character", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const colors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-green-600"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];

  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p className="text-xs text-muted-foreground">{labels[score]}</p>
      )}
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.pass ? "text-green-500" : "text-muted-foreground"}`}>
            <CheckCircle2 className={`w-3 h-3 ${c.pass ? "opacity-100" : "opacity-30"}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangePassword() {
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const changeMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    changeMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your account password. Passwords expire every 90 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="text-center space-y-3 py-6">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <p className="font-medium text-green-600">Password changed successfully!</p>
                <p className="text-sm text-muted-foreground">Redirecting to dashboard…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNew(!showNew)}
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={newPassword} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={confirmPassword && newPassword !== confirmPassword ? "border-destructive" : ""}
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => navigate("/")} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={changeMutation.isPending || newPassword !== confirmPassword}
                  >
                    {changeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
