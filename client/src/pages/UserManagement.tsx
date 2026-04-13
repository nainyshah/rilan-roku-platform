import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  UserPlus,
  Users,
  ShieldCheck,
  ShieldOff,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";

type Role = "user" | "admin" | "content_manager" | "publishing_manager";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  user: "User",
  content_manager: "Content Manager",
  publishing_manager: "Publishing Manager",
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-500/10 text-red-600 border-red-500/20",
  user: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  content_manager: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  publishing_manager: "bg-green-500/10 text-green-600 border-green-500/20",
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  "user.create":          { label: "Created",          color: "bg-green-500/10 text-green-600 border-green-500/20" },
  "user.update":          { label: "Updated",          color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  "user.deactivate":      { label: "Deactivated",      color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  "user.change_password": { label: "Password Changed", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

const AUDIT_PAGE_SIZE = 20;

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditLogTab() {
  const [offset, setOffset] = useState(0);

  const auditQuery = trpc.auditLog.list.useQuery(
    { limit: AUDIT_PAGE_SIZE, offset },
    { keepPreviousData: true } as any
  );

  const entries = auditQuery.data?.entries ?? [];
  const hasMore = entries.length === AUDIT_PAGE_SIZE;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Admin Audit Log
        </CardTitle>
        <CardDescription>
          A chronological record of all admin-initiated actions on this platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {auditQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No audit log entries yet.</p>
            <p className="text-xs mt-1 opacity-70">
              Actions such as creating, updating, or deactivating users will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-border">
            {entries.map((entry) => {
              const actionMeta = ACTION_LABELS[entry.action] ?? {
                label: entry.action,
                color: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
              };
              return (
                <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${actionMeta.color}`}
                      >
                        {actionMeta.label}
                      </span>
                      {entry.targetName && (
                        <span className="text-sm font-medium truncate">{entry.targetName}</span>
                      )}
                      {entry.targetType && (
                        <span className="text-xs text-muted-foreground">({entry.targetType})</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      by{" "}
                      <span className="font-medium text-foreground">
                        {entry.actorName ?? `User #${entry.actorId}`}
                      </span>
                      {entry.ipAddress && (
                        <> &middot; <span className="font-mono">{entry.ipAddress}</span></>
                      )}
                    </p>
                    {Boolean(entry.metadata && Object.keys(entry.metadata as Record<string, unknown>).length > 0) && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                          View details
                        </summary>
                        <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-x-auto text-muted-foreground">
                          {JSON.stringify(entry.metadata as Record<string, unknown>, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <time
                    className="text-xs text-muted-foreground shrink-0 tabular-nums"
                    dateTime={new Date(entry.createdAt).toISOString()}
                    title={new Date(entry.createdAt).toLocaleString()}
                  >
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {(offset > 0 || hasMore) && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - AUDIT_PAGE_SIZE))}
              disabled={offset === 0 || auditQuery.isFetching}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Showing {offset + 1}–{offset + entries.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + AUDIT_PAGE_SIZE)}
              disabled={!hasMore || auditQuery.isFetching}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<number | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [mustChange, setMustChange] = useState(true);
  const [createError, setCreateError] = useState("");
  const [newResetPassword, setNewResetPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const utils = trpc.useUtils();

  const listQuery = trpc.auth.listUsers.useQuery();

  const createMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.listUsers.invalidate();
      await utils.auditLog.list.invalidate();
      setCreateOpen(false);
      setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("user"); setMustChange(true);
      toast.success("User created successfully.");
    },
    onError: (err) => setCreateError(err.message),
  });

  const updateUserMutation = trpc.auth.updateUser.useMutation({
    onSuccess: async () => {
      await utils.auth.listUsers.invalidate();
      await utils.auditLog.list.invalidate();
      toast.success("User updated.");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const resetPasswordMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.listUsers.invalidate();
      setResetOpen(null);
      setNewResetPassword("");
      toast.success("Password reset successfully.");
    },
    onError: (err: { message: string }) => setResetError(err.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    createMutation.mutate({
      email: newEmail,
      name: newName,
      password: newPassword,
      role: newRole,
      mustChangePassword: mustChange,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              User Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage platform users. Only admins can access this page.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                New User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  The user will receive their credentials and can change their password on first login.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 py-2">
                {createError && (
                  <Alert variant="destructive">
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-name">Full Name</Label>
                  <Input
                    id="new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="jane@rilan.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Temporary Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Require password change</p>
                    <p className="text-xs text-muted-foreground">User must set a new password on first login.</p>
                  </div>
                  <Switch checked={mustChange} onCheckedChange={setMustChange} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create User
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs: Users | Audit Log */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Users
              {listQuery.data && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 h-4">
                  {listQuery.data.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          {/* ── Users tab ── */}
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Users</CardTitle>
                <CardDescription>
                  {listQuery.data?.length ?? 0} user{listQuery.data?.length !== 1 ? "s" : ""} registered
                </CardDescription>
              </CardHeader>
              <CardContent>
                {listQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {listQuery.data?.map((user) => {
                      const role = user.role as Role;
                      const daysSincePwChange = user.passwordChangedAt
                        ? Math.floor((Date.now() - new Date(user.passwordChangedAt).getTime()) / 86_400_000)
                        : null;
                      const passwordExpiringSoon = daysSincePwChange !== null && daysSincePwChange >= 75;
                      const passwordExpired = daysSincePwChange !== null && daysSincePwChange >= 90;

                      return (
                        <div
                          key={user.id}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                            !user.isActive ? "opacity-50 bg-muted/30" : "bg-card hover:bg-muted/20"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <span className="text-sm font-semibold text-primary">
                                {(user.name || user.email || "?")[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{user.name || "—"}</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] ?? ""}`}>
                                  {ROLE_LABELS[role] ?? role}
                                </span>
                                {user.totpEnabled && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                                    <ShieldCheck className="w-3 h-3" /> 2FA
                                  </span>
                                )}
                                {user.loginMethod === "google" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-600 border border-sky-500/20">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Google
                                  </span>
                                )}
                                {user.mustChangePassword && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 border border-orange-500/20">
                                    Must change password
                                  </span>
                                )}
                                {passwordExpired && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                                    Password expired
                                  </span>
                                )}
                                {!passwordExpired && passwordExpiringSoon && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                                    Password expiring soon
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {/* Reset Password */}
                            <Dialog open={resetOpen === user.id} onOpenChange={(o) => { setResetOpen(o ? user.id : null); setNewResetPassword(""); setResetError(""); }}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="Reset password">
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-sm">
                                <DialogHeader>
                                  <DialogTitle>Reset Password</DialogTitle>
                                  <DialogDescription>Set a new temporary password for {user.name || user.email}.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3 py-2">
                                  {resetError && <Alert variant="destructive"><AlertDescription>{resetError}</AlertDescription></Alert>}
                                  <div className="space-y-2">
                                    <Label>New Password</Label>
                                    <Input
                                      type="password"
                                      value={newResetPassword}
                                      onChange={(e) => setNewResetPassword(e.target.value)}
                                      placeholder="Min. 6 characters"
                                      minLength={6}
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setResetOpen(null)}>Cancel</Button>
                                  <Button
                                    disabled={resetPasswordMutation.isPending || newResetPassword.length < 6}
                                    onClick={() => resetPasswordMutation.mutate({ email: user.email!, name: user.name!, password: newResetPassword, role: user.role as Role, mustChangePassword: true })}
                                  >
                                    {resetPasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Reset
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* Toggle Active */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title={user.isActive ? "Deactivate user" : "Activate user"}
                              onClick={() => updateUserMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                              disabled={updateUserMutation.isPending}
                            >
                              {user.isActive
                                ? <ToggleRight className="w-4 h-4 text-green-500" />
                                : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                              }
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Audit Log tab ── */}
          <TabsContent value="audit" className="mt-4">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
