import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Film, FolderOpen, Save, Tv, ExternalLink, Plus, Trash2, GripVertical } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const channelId = parseInt(id ?? "0");

  const { data: channel, isLoading, refetch } = trpc.channels.get.useQuery({ id: channelId }, { enabled: !!channelId });
  const { data: channelVideos, refetch: refetchVideos } = trpc.channels.getVideos.useQuery({ channelId }, { enabled: !!channelId });
  const { data: channelCategories, refetch: refetchCategories } = trpc.channels.getCategories.useQuery({ channelId }, { enabled: !!channelId });
  const { data: allVideos } = trpc.videos.list.useQuery({ limit: 100 });
  const { data: allCategories } = trpc.categories.list.useQuery();

  const [form, setForm] = useState({ name: "", description: "", language: "en", contentRating: "all" });

  useEffect(() => {
    if (channel) {
      setForm({
        name: channel.name,
        description: channel.description ?? "",
        language: channel.language ?? "en",
        contentRating: channel.contentRating ?? "all",
      });
    }
  }, [channel]);

  const updateMutation = trpc.channels.update.useMutation({
    onSuccess: () => { toast.success("Channel updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const removeVideoMutation = trpc.channels.removeVideo.useMutation({
    onSuccess: () => { toast.success("Video removed"); refetchVideos(); },
    onError: (e) => toast.error(e.message),
  });

  const assignVideoMutation = trpc.channels.assignVideo.useMutation({
    onSuccess: () => { toast.success("Video assigned"); refetchVideos(); },
    onError: (e) => toast.error(e.message),
  });

  const removeCategoryMutation = trpc.channels.removeCategory.useMutation({
    onSuccess: () => { toast.success("Row removed"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  const assignCategoryMutation = trpc.channels.assignCategory.useMutation({
    onSuccess: () => { toast.success("Row added"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  const updateRowMutation = trpc.channels.updateCategoryRow.useMutation({
    onSuccess: () => { toast.success("Row updated"); refetchCategories(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <div className="h-64 bg-muted animate-pulse rounded-lg" />
    </div>
  );

  if (!channel) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Channel not found.</p>
      <Button variant="outline" onClick={() => setLocation("/channels")} className="mt-4">Back to Channels</Button>
    </div>
  );

  const assignedVideoIds = new Set(channelVideos?.map((r) => r.video.id) ?? []);
  const unassignedVideos = allVideos?.items.filter((v) => !assignedVideoIds.has(v.id)) ?? [];
  const assignedCategoryIds = new Set(channelCategories?.map((r) => r.category.id) ?? []);
  const unassignedCategories = allCategories?.filter((c) => !assignedCategoryIds.has(c.id)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/channels")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Channels
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-foreground">{channel.name}</h1>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          channel.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
          channel.status === "inactive" ? "bg-red-500/15 text-red-400 border-red-500/30" :
          "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
        }`}>{channel.status}</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">Feed: /api/roku/feed/{channel.slug}.json</span>
        <a href={`/api/roku/feed/${channel.slug}.json`} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> View Feed
        </a>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="bg-muted">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="videos">Videos ({channelVideos?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="rows">Content Rows ({channelCategories?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Channel Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Channel Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug (read-only)</Label>
                  <Input value={channel.slug} disabled className="font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
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
                onClick={() => updateMutation.mutate({ id: channelId, ...form })}
                disabled={updateMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Assigned Videos</CardTitle>
              <Select onValueChange={(videoId) => assignVideoMutation.mutate({ channelId, videoId: parseInt(videoId) })}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="+ Add video..." />
                </SelectTrigger>
                <SelectContent>
                  {unassignedVideos.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)} className="text-xs">{v.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {channelVideos?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No videos assigned. Add videos above.</p>
              ) : (
                <div className="space-y-2">
                  {channelVideos?.map((row) => (
                    <div key={row.assignment.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                      {row.video.thumbnailUrl && (
                        <img src={row.video.thumbnailUrl} alt="" className="h-10 w-16 object-cover rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{row.video.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${
                            row.video.publishStatus === "published" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                            row.video.publishStatus === "draft" ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" :
                            "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}>{row.video.publishStatus}</span>
                          {row.assignment.featuredFlag && (
                            <span className="text-xs text-amber-400">★ Featured</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => removeVideoMutation.mutate({ channelId, videoId: row.video.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Rows Tab */}
        <TabsContent value="rows" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Content Rows (Home Screen)</CardTitle>
              <Select onValueChange={(catId) => assignCategoryMutation.mutate({ channelId, categoryId: parseInt(catId) })}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="+ Add row..." />
                </SelectTrigger>
                <SelectContent>
                  {unassignedCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {channelCategories?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No rows configured. Add categories above.</p>
              ) : (
                <div className="space-y-2">
                  {channelCategories?.map((row) => (
                    <div key={row.row.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                      <div className="flex-1 min-w-0">
                        <Input
                          className="h-7 text-xs bg-transparent border-transparent hover:border-border focus:border-border"
                          defaultValue={row.row.rowTitle ?? row.category.name}
                          onBlur={(e) => {
                            if (e.target.value !== (row.row.rowTitle ?? row.category.name)) {
                              updateRowMutation.mutate({ id: row.row.id, rowTitle: e.target.value });
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground px-1">Category: {row.category.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.row.isVisible}
                          onCheckedChange={(v) => updateRowMutation.mutate({ id: row.row.id, isVisible: v })}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={() => removeCategoryMutation.mutate({ channelId, categoryId: row.category.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
