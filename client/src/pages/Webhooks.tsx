import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Webhook,
  Plus,
  Trash2,
  Edit2,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  { value: "feed.updated", label: "Feed Updated" },
  { value: "feed.invalidated", label: "Feed Invalidated" },
  { value: "channel.published", label: "Channel Published" },
  { value: "channel.unpublished", label: "Channel Unpublished" },
  { value: "video.published", label: "Video Published" },
  { value: "video.archived", label: "Video Archived" },
] as const;

// ── Form Schema ────────────────────────────────────────────────────────────

const webhookFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(255),
  url: z.string().url("Must be a valid URL"),
  secret: z.string().max(255).optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().default(true),
});
type WebhookFormValues = z.infer<typeof webhookFormSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function statusBadge(success: boolean) {
  return success ? (
    <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Success
    </Badge>
  ) : (
    <Badge className="bg-red-600/20 text-red-400 border-red-600/30 gap-1">
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
}

// ── Delivery Log Row ───────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: { id: number; event: string; statusCode: number | null; responseBody: string | null; attempt: number; success: boolean; deliveredAt: Date; webhookLabel?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TableRow className="cursor-pointer hover:bg-white/5">
        <TableCell>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground">
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              #{d.id}
            </button>
          </CollapsibleTrigger>
        </TableCell>
        {d.webhookLabel && <TableCell className="text-xs text-muted-foreground">{d.webhookLabel}</TableCell>}
        <TableCell>
          <Badge variant="outline" className="text-xs font-mono">{d.event}</Badge>
        </TableCell>
        <TableCell>{statusBadge(d.success)}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{d.statusCode ?? "—"}</TableCell>
        <TableCell className="text-xs text-muted-foreground">Attempt {d.attempt}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDate(d.deliveredAt)}</TableCell>
      </TableRow>
      {open && d.responseBody && (
        <TableRow>
          <TableCell colSpan={d.webhookLabel ? 7 : 6} className="bg-black/20 p-0">
            <CollapsibleContent>
              <pre className="p-3 text-xs text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                {d.responseBody}
              </pre>
            </CollapsibleContent>
          </TableCell>
        </TableRow>
      )}
    </Collapsible>
  );
}

// ── Webhook Card ───────────────────────────────────────────────────────────

type WebhookCfg = { id: number; label: string; url: string; secret?: string | null; events?: unknown; active: boolean; createdAt: Date };

function WebhookCard({
  cfg,
  channelId,
  onEdit,
  onDelete,
  onRefresh,
}: {
  cfg: WebhookCfg;
  channelId: number;
  onEdit: (cfg: WebhookCfg) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { data: deliveries, refetch: refetchDeliveries } = trpc.webhooks.deliveries.useQuery(
    { webhookId: cfg.id, limit: 20 },
    { enabled: showDeliveries }
  );

  const testFire = trpc.webhooks.testFire.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Test ping delivered (HTTP ${result.statusCode})`);
      } else {
        toast.warning(`Test ping failed — HTTP ${result.statusCode ?? "N/A"}: ${result.error ?? result.responseBody ?? "unknown error"}`);
      }
      if (showDeliveries) refetchDeliveries();
      onRefresh();
    },
    onError: (err) => toast.error(`Test failed: ${err.message}`),
  });

  const eventsArr: string[] = (() => {
    try {
      if (!cfg.events) return [];
      const raw = typeof cfg.events === "string" ? cfg.events : JSON.stringify(cfg.events);
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  })();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Webhook className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold truncate">{cfg.label}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{cfg.url}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className={cfg.active
                ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                : "bg-muted text-muted-foreground"}
            >
              {cfg.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Events */}
        <div className="flex flex-wrap gap-1">
          {eventsArr.length === 0 ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">All events</Badge>
          ) : (
            eventsArr.map((ev) => (
              <Badge key={ev} variant="outline" className="text-xs font-mono">{ev}</Badge>
            ))
          )}
        </div>

        {/* Secret */}
        {cfg.secret && (
          <div className="flex items-center gap-2 bg-black/20 rounded px-2 py-1.5">
            <span className="text-xs text-muted-foreground">Secret:</span>
            <code className="text-xs font-mono flex-1 truncate">
              {showSecret ? cfg.secret : "••••••••••••••••"}
            </code>
            <button
              onClick={() => setShowSecret((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(cfg.secret!); toast.success("Secret copied"); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => testFire.mutate({ id: cfg.id })}
            disabled={testFire.isPending}
          >
            {testFire.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Test Ping
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => { setShowDeliveries((v) => !v); if (!showDeliveries) refetchDeliveries(); }}
          >
            <Clock className="w-3 h-3" />
            {showDeliveries ? "Hide" : "Delivery Log"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => onEdit(cfg)}
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onDelete(cfg.id)}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
        </div>

        {/* Delivery Log */}
        {showDeliveries && (
          <div className="mt-2 border border-border rounded-md overflow-hidden">
            {!deliveries || deliveries.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 text-center">No deliveries yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs w-12">#</TableHead>
                    <TableHead className="text-xs">Event</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">HTTP</TableHead>
                    <TableHead className="text-xs">Attempt</TableHead>
                    <TableHead className="text-xs">Delivered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <DeliveryRow key={d.id} d={d} />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Webhooks() {
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<{ id: number; label: string; url: string; secret?: string | null; events?: unknown; active: boolean; createdAt: Date } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAllDeliveries, setShowAllDeliveries] = useState(false);

  const { data: channels } = trpc.channels.list.useQuery();
  const utils = trpc.useUtils();

  const { data: webhooks, refetch: refetchWebhooks } = trpc.webhooks.list.useQuery(
    { channelId: selectedChannelId! },
    { enabled: !!selectedChannelId }
  );

  const { data: allDeliveries } = trpc.webhooks.channelDeliveries.useQuery(
    { channelId: selectedChannelId!, limit: 50 },
    { enabled: !!selectedChannelId && showAllDeliveries }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookFormSchema) as any,
    defaultValues: { label: "", url: "", secret: "", events: [], active: true },
  });

  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      toast.success("Webhook created");
      setShowCreateDialog(false);
      form.reset();
      refetchWebhooks();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.webhooks.update.useMutation({
    onSuccess: () => {
      toast.success("Webhook updated");
      setEditingWebhook(null);
      form.reset();
      refetchWebhooks();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("Webhook deleted");
      setDeletingId(null);
      refetchWebhooks();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    form.reset({ label: "", url: "", secret: "", events: [], active: true });
    setShowCreateDialog(true);
  }

  function openEdit(cfg: typeof editingWebhook) {
    if (!cfg) return;
    const eventsArr: string[] = (() => {
      try {
        if (!cfg.events) return [];
        const raw = typeof cfg.events === "string" ? cfg.events : JSON.stringify(cfg.events);
        return JSON.parse(raw) as string[];
      } catch { return []; }
    })();
    form.reset({
      label: cfg.label,
      url: cfg.url,
      secret: cfg.secret ?? "",
      events: eventsArr,
      active: cfg.active,
    });
    setEditingWebhook(cfg);
  }

  function onSubmit(values: WebhookFormValues): void {
    if (!selectedChannelId) return;
    if (editingWebhook) {
      updateMutation.mutate({
        id: editingWebhook.id,
        label: values.label,
        url: values.url,
        secret: values.secret || null,
        events: (values.events?.length ? values.events as ("feed.updated" | "feed.invalidated" | "channel.published" | "channel.unpublished" | "video.published" | "video.archived" | "test.ping")[] : null),
        active: values.active,
      });
    } else {
      createMutation.mutate({
        channelId: selectedChannelId,
        label: values.label,
        url: values.url,
        secret: values.secret || undefined,
        events: (values.events?.length ? values.events as ("feed.updated" | "feed.invalidated" | "channel.published" | "channel.unpublished" | "video.published" | "video.archived" | "test.ping")[] : undefined),
        active: values.active,
      });
    }
  }

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="w-6 h-6 text-primary" />
              Webhooks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Notify external services when Roku feed content changes. Payloads are HMAC-SHA256 signed.
            </p>
          </div>
          {selectedChannelId && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Webhook
            </Button>
          )}
        </div>

        {/* Channel selector */}
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm shrink-0">Channel</Label>
              <Select
                value={selectedChannelId?.toString() ?? ""}
                onValueChange={(v) => {
                  setSelectedChannelId(Number(v));
                  setShowAllDeliveries(false);
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a channel…" />
                </SelectTrigger>
                <SelectContent>
                  {channels?.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id.toString()}>
                      {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedChannel && (
                <Badge variant="outline" className="text-xs font-mono">{selectedChannel.slug}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Webhook list */}
        {selectedChannelId && (
          <>
            {!webhooks || webhooks.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <Webhook className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No webhooks configured for this channel.</p>
                  <Button onClick={openCreate} className="mt-4 gap-2" size="sm">
                    <Plus className="w-4 h-4" /> Add your first webhook
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {webhooks.map((cfg) => (
                  <WebhookCard
                    key={cfg.id}
                    cfg={cfg}
                    channelId={selectedChannelId}
                    onEdit={openEdit}
                    onDelete={setDeletingId}
                    onRefresh={refetchWebhooks}
                  />
                ))}
              </div>
            )}

            {/* All deliveries toggle */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Channel Delivery Log</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setShowAllDeliveries((v) => !v)}
                  >
                    <Clock className="w-3 h-3" />
                    {showAllDeliveries ? "Hide" : "Show All"}
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  Recent deliveries across all webhooks for this channel
                </CardDescription>
              </CardHeader>
              {showAllDeliveries && (
                <CardContent className="pt-0">
                  {!allDeliveries || allDeliveries.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No deliveries yet</p>
                  ) : (
                    <div className="border border-border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs w-12">#</TableHead>
                            <TableHead className="text-xs">Webhook</TableHead>
                            <TableHead className="text-xs">Event</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">HTTP</TableHead>
                            <TableHead className="text-xs">Attempt</TableHead>
                            <TableHead className="text-xs">Delivered</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allDeliveries.map((d) => (
                            <DeliveryRow key={d.id} d={{ ...d, webhookLabel: d.webhookLabel }} />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </>
        )}

        {/* Signing info card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Webhook Signature Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Every delivery includes an <code className="bg-muted px-1 rounded">X-Roku-Signature</code> header
              with an HMAC-SHA256 digest of the request body, signed with your webhook secret.
            </p>
            <pre className="bg-black/30 rounded p-3 text-xs font-mono text-muted-foreground overflow-x-auto">
{`// Node.js verification example
const crypto = require('crypto');
const sig = req.headers['x-roku-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(req.body) // raw Buffer
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(sig)
);`}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editingWebhook}
        onOpenChange={(open) => {
          if (!open) { setShowCreateDialog(false); setEditingWebhook(null); form.reset(); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? "Edit Webhook" : "Add Webhook"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input {...form.register("label")} placeholder="e.g. Roku Feed Notifier" />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Endpoint URL *</Label>
              <Input {...form.register("url")} placeholder="https://your-server.com/webhook" />
              {form.formState.errors.url && (
                <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Signing Secret</Label>
              <Input {...form.register("secret")} placeholder="Optional — leave blank to skip signing" />
              <p className="text-xs text-muted-foreground">
                Used to generate <code>X-Roku-Signature</code> header for verification.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Subscribe to Events</Label>
              <p className="text-xs text-muted-foreground">Leave all unchecked to receive every event.</p>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((ev) => {
                  const currentEvents = form.watch("events") ?? [];
                  const checked = currentEvents.includes(ev.value);
                  return (
                    <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          const current = form.getValues("events") ?? [];
                          form.setValue(
                            "events",
                            c ? [...current, ev.value] : current.filter((e) => e !== ev.value)
                          );
                        }}
                      />
                      <span className="text-xs">{ev.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.watch("active")}
                onCheckedChange={(v) => form.setValue("active", v)}
              />
              <Label className="text-sm">Active</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreateDialog(false); setEditingWebhook(null); form.reset(); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving…" : editingWebhook ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the webhook and all its delivery logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ id: deletingId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
