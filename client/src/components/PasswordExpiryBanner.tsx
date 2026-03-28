import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

export function PasswordExpiryBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [, navigate] = useLocation();
  const meQuery = trpc.auth.me.useQuery();

  const user = meQuery.data as {
    passwordExpired?: boolean;
    daysUntilPasswordExpiry?: number | null;
    mustChangePassword?: boolean;
  } | null | undefined;

  if (!user || dismissed) return null;

  const isExpired = user.passwordExpired || user.mustChangePassword;
  const daysLeft = user.daysUntilPasswordExpiry;
  const isExpiringSoon = !isExpired && daysLeft !== null && daysLeft !== undefined && daysLeft <= 15;

  if (!isExpired && !isExpiringSoon) return null;

  return (
    <div
      className={`relative flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium ${
        isExpired
          ? "bg-destructive text-destructive-foreground"
          : "bg-yellow-500/90 text-yellow-950"
      }`}
    >
      <div className="flex items-center gap-2">
        {isExpired ? (
          <ShieldAlert className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <span>
          {isExpired
            ? "Your password has expired or must be changed before continuing."
            : `Your password expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant={isExpired ? "secondary" : "outline"}
          className="h-7 text-xs"
          onClick={() => navigate("/change-password")}
        >
          Change Password
        </Button>
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            className="opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
