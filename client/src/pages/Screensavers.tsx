import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, MonitorPlay, ToggleLeft, ToggleRight, Image as ImageIcon, Film, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";

type MediaType = "image" | "video";

export default function Screensavers() {
  const utils = trpc.useUtils();
  const { data: apps } = trpc.screensaverApps.list.useQuery();

  const [appId, setAppId] = useState<number | null>(null);
  useEffect(() => {
    if (appId == null && apps && apps.length > 0) setAppId(apps[0].id);
  }, [apps, appId]);

  const { data: items, isLoading } = trpc.screensaver.list.useQuery(
    { appId: appId ?? 0 },
    { enabled: appId != null },
  );

  // ── App dialog ──
  const [appOpen, setAppOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [appDesc, setAppDesc] = useState("");
  const createApp = trpc.screensaverApps.create.useMutation({
    onSuccess: () => { utils.screensaverApps.list.invalidate(); toast.success("App created"); setAppOpen(false); setAppName(""); setAppDesc(""); },
    onError: (e) => toast.error(e.message),
  });
  const deleteApp = trpc.screensaverApps.delete.useMutation({
    onSuccess: () => { utils.screensaverApps.list.invalidate(); setAppId(null); toast.success("App deleted"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Item dialog ──
  const [open, setOpen] = useState(false);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  function reset() { setMediaType("image"); setTitle(""); setImageUrl(""); setVideoUrl(""); }

  const create = trpc.screensaver.create.useMutation({
    onSuccess: () => { utils.screensaver.list.invalidate(); toast.success("Item added"); setOpen(false); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.screensaver.update.useMutation({
    onSuccess: () => utils.screensaver.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.screensaver.delete.useMutation({
    onSuccess: () => { utils.screensaver.list.invalidate(); toast.success("Removed"); },
    onError: (e) => toast.error(e.message),
  });

  const currentApp = apps?.find((a) => a.id === appId);
  const canSave = mediaType === "image" ? !!imageUrl : !!videoUrl;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <MonitorPlay className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Screensavers</h1>
          <p className="text-sm text-muted-foreground">
            Manage screensaver apps and the media each one shows on Roku.
          </p>
        </div>
      </div>

      {/* App bar: pick app, create app, feed URL */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={appId != null ? String(appId) : ""} onValueChange={(v) => setAppId(Number(v))}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select a screensaver app" /></SelectTrigger>
          <SelectContent>
            {apps?.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={appOpen} onOpenChange={setAppOpen}>
          <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2" /> New app</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New screensaver app</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Aquarium, World Cityscape" />
              </div>
              <div className="space-y-1">
                <Label>Description (optional)</Label>
                <Input value={appDesc} onChange={(e) => setAppDesc(e.target.value)} />
              </div>
              <Button className="w-full" disabled={!appName || createApp.isPending}
                onClick={() => createApp.mutate({ name: appName, description: appDesc || undefined })}>
                {createApp.isPending ? "Creating…" : "Create app"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {currentApp ? (
          <>
            <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              /api/roku/screensaver/{currentApp.slug}.json
            </code>
            <Button variant="ghost" size="sm" className="text-destructive"
              onClick={() => { if (confirm(`Delete app "${currentApp.name}" and its items?`)) deleteApp.mutate({ id: currentApp.id }); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete app
            </Button>
          </>
        ) : null}
      </div>

      {!apps || apps.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No screensaver apps yet. Click "New app" (e.g. Aquarium) to start.
        </CardContent></Card>
      ) : appId == null ? null : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{currentApp?.name} — media</h2>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add item</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add item to {currentApp?.name}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="flex gap-2">
                    <Button variant={mediaType === "image" ? "default" : "outline"} size="sm" onClick={() => setMediaType("image")}>
                      <ImageIcon className="h-4 w-4 mr-1" /> Image
                    </Button>
                    <Button variant={mediaType === "video" ? "default" : "outline"} size="sm" onClick={() => setMediaType("video")}>
                      <Film className="h-4 w-4 mr-1" /> Video (slow-mo)
                    </Button>
                  </div>
                  <div className="space-y-1"><Label>Title (optional)</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                  {mediaType === "video" ? (
                    <>
                      <div className="space-y-1"><Label>Video URL (HLS .m3u8 or MP4)</Label>
                        <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…/playlist.m3u8" /></div>
                      <div className="space-y-1"><Label>Poster URL (optional)</Label>
                        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/thumbnail.jpg" /></div>
                      <p className="text-xs text-muted-foreground">Played muted + looping. For slow-mo, use a clip encoded slow-motion.</p>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1"><Label>Image URL</Label>
                        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/image.jpg" /></div>
                      {imageUrl ? <div className="rounded-lg overflow-hidden border border-border aspect-video bg-muted">
                        <img src={imageUrl} alt="preview" className="w-full h-full object-cover" /></div> : null}
                    </>
                  )}
                  <Button className="w-full" disabled={!canSave || create.isPending}
                    onClick={() => create.mutate({
                      appId: appId!, title: title || undefined, mediaType,
                      imageUrl: imageUrl || undefined,
                      videoUrl: mediaType === "video" ? (videoUrl || undefined) : undefined,
                      sortOrder: items ? items.length : 0,
                    })}>
                    {create.isPending ? "Adding…" : "Add item"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? <p className="text-muted-foreground">Loading…</p>
            : !items || items.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No media in this app yet.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((it) => (
                  <Card key={it.id} className="overflow-hidden">
                    <div className="aspect-video bg-muted relative flex items-center justify-center">
                      {it.imageUrl ? <img src={it.imageUrl} alt={it.title ?? ""} className="w-full h-full object-cover" />
                        : <Film className="h-10 w-10 text-muted-foreground" />}
                      {it.mediaType === "video" ? <PlayCircle className="h-12 w-12 text-white/90 absolute drop-shadow-lg" /> : null}
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{it.title || "Untitled"}</span>
                        <div className="flex gap-1 shrink-0">
                          <Badge variant="outline">{it.mediaType === "video" ? "Video" : "Image"}</Badge>
                          <Badge variant={it.isActive ? "default" : "secondary"}>{it.isActive ? "Active" : "Hidden"}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => update.mutate({ id: it.id, isActive: it.isActive ? 0 : 1 })}>
                          {it.isActive ? <><ToggleRight className="h-4 w-4 mr-1" /> Hide</> : <><ToggleLeft className="h-4 w-4 mr-1" /> Show</>}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => remove.mutate({ id: it.id })}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  );
}
