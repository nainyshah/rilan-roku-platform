import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Tv, Radio, ExternalLink, Settings, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    inactive: "bg-red-500/15 text-red-400 border-red-500/30",
    draft: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}

export default function Channels() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", language: "en", contentRating: "all" });

  const { data: channels, isLoading, refetch } = trpc.channels.list.useQuery({ search: search || undefined });
  const createMutation = trpc.channels.create.useMutation({
    onSuccess: () => { toast.success("Channel created"); setOpen(false); refetch(); setForm({ name: "", description: "", language: "en", contentRating: "all" }); },
    onError: (e) => toast.error(e.message),
  });
  const setStatusMutation = trpc.channels.setStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your Roku streaming channels</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> New Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Channel Name *</Label>
                <Input placeholder="e.g. RILAN Sports TV" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Channel description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Content Rating</Label>
                  <Select value={form.contentRating} onValueChange={(v) => setForm({ ...form, contentRating: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ages</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                      <SelectItem value="pg">PG</SelectItem>
                      <SelectItem value="pg-13">PG-13</SelectItem>
                      <SelectItem value="r">R</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!form.name || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? "Creating..." : "Create Channel"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search channels..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Channel List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-5 h-36" />
            </Card>
          ))}
        </div>
      ) : channels?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tv className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No channels found. Create your first channel.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels?.map((ch) => (
            <Card key={ch.id} className="bg-card border-border hover:border-primary/30 transition-colors group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Radio className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ch.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ch.slug}</p>
                    </div>
                  </div>
                  <StatusBadge status={ch.status} />
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
                  {ch.description || "No description"}
                </p>

                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{ch.language}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{ch.contentRating}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs h-8"
                    onClick={() => setLocation(`/channels/${ch.id}`)}
                  >
                    <Settings className="h-3 w-3 mr-1" /> Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    onClick={() => {
                      const next = ch.status === "active" ? "inactive" : "active";
                      setStatusMutation.mutate({ id: ch.id, status: next });
                    }}
                    title={ch.status === "active" ? "Deactivate" : "Activate"}
                  >
                    {ch.status === "active" ? (
                      <ToggleRight className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <a
                    href={`/api/roku/feed/${ch.slug}.json`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 px-2 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                    title="View Feed"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
