import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Save, ShieldCheck, AlertTriangle, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";

type VideoForm = {
  title: string;
  description: string;
  thumbnailUrl: string;
  streamUrl: string;
  durationSeconds: string;
  language: string;
  contentType: "movie" | "series" | "episode" | "short" | "clip" | "special";
  contentRating: string;
  releaseDate: string;
  rightsOwner: string;
  publishStatus: "draft" | "pending" | "approved" | "published" | "archived";
  categoryIds: number[];
  tags: string;
};

const defaultForm: VideoForm = {
  title: "",
  description: "",
  thumbnailUrl: "",
  streamUrl: "",
  durationSeconds: "",
  language: "en",
  contentType: "clip",
  contentRating: "all",
  releaseDate: "",
  rightsOwner: "RILAN GAMES LLC",
  publishStatus: "draft",
  categoryIds: [],
  tags: "",
};

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const isNew = id === "new";
  const videoId = isNew ? 0 : parseInt(id ?? "0");

  const { data: video, isLoading, refetch } = trpc.videos.get.useQuery({ id: videoId }, { enabled: !isNew && !!videoId });
  const { data: allCategories } = trpc.categories.list.useQuery();
  const [form, setForm] = useState<VideoForm>(defaultForm);
  const [validationResult, setValidationResult] = useState<{ status: string; issues: string[] } | null>(null);

  useEffect(() => {
    if (video) {
      setForm({
        title: video.title,
        description: video.description ?? "",
        thumbnailUrl: video.thumbnailUrl ?? "",
        streamUrl: video.streamUrl ?? "",
        durationSeconds: String(video.durationSeconds ?? ""),
        language: video.language ?? "en",
        contentType: video.contentType ?? "clip",
        contentRating: video.contentRating ?? "all",
        releaseDate: video.releaseDate ?? "",
        rightsOwner: video.rightsOwner ?? "RILAN GAMES LLC",
        publishStatus: video.publishStatus,
        categoryIds: video.categoryIds ?? [],
        tags: Array.isArray(video.tags) ? (video.tags as string[]).join(", ") : "",
      });
    }
  }, [video]);

  const createMutation = trpc.videos.create.useMutation({
    onSuccess: () => { toast.success("Video created"); setLocation("/videos"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.videos.update.useMutation({
    onSuccess: () => { toast.success("Video updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const validateMutation = trpc.videos.validate.useMutation({
    onSuccess: (r) => {
      setValidationResult({ status: r.status, issues: r.issues });
      toast.success(`Validation complete: ${r.status}`);
      if (!isNew) refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const payload = {
      ...form,
      durationSeconds: form.durationSeconds ? parseInt(form.durationSeconds) : undefined,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    };
    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: videoId, ...payload });
    }
  };

  const toggleCategory = (catId: number) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(catId)
        ? f.categoryIds.filter((id) => id !== catId)
        : [...f.categoryIds, catId],
    }));
  };

  if (!isNew && isLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <div className="h-64 bg-muted animate-pulse rounded-lg" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/videos")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Videos
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-foreground">
          {isNew ? "Add New Video" : (video?.title ?? "Edit Video")}
        </h1>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div className={`p-4 rounded-lg border ${
          validationResult.status === "valid" ? "bg-emerald-500/10 border-emerald-500/30" :
          validationResult.status === "warning" ? "bg-amber-500/10 border-amber-500/30" :
          "bg-red-500/10 border-red-500/30"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {validationResult.status === "valid" ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
            <span className="text-sm font-medium text-foreground">Validation: {validationResult.status}</span>
          </div>
          {validationResult.issues.length > 0 && (
            <ul className="space-y-1">
              {validationResult.issues.map((issue, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Video Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input placeholder="Video title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Video description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Thumbnail URL</Label>
                <Input placeholder="https://..." value={form.thumbnailUrl} onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })} />
                {form.thumbnailUrl && (
                  <img src={form.thumbnailUrl} alt="Thumbnail preview" className="h-24 w-40 object-cover rounded border border-border mt-2" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Stream URL *</Label>
                <Input placeholder="https://... (.mp4, .m3u8, .mpd)" value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Duration (seconds) *</Label>
                  <Input type="number" placeholder="e.g. 320" value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Release Date</Label>
                  <Input type="date" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rights Owner</Label>
                <Input placeholder="RILAN GAMES LLC" value={form.rightsOwner} onChange={(e) => setForm({ ...form, rightsOwner: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tags (comma-separated)</Label>
                <Input placeholder="tag1, tag2, tag3" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Publishing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.publishStatus} onValueChange={(v) => setForm({ ...form, publishStatus: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Content Type</Label>
                <Select value={form.contentType} onValueChange={(v) => setForm({ ...form, contentType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clip">Clip</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="movie">Movie</SelectItem>
                    <SelectItem value="episode">Episode</SelectItem>
                    <SelectItem value="series">Series</SelectItem>
                    <SelectItem value="special">Special</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Content Rating</Label>
                <Select value={form.contentRating} onValueChange={(v) => setForm({ ...form, contentRating: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages (G)</SelectItem>
                    <SelectItem value="kids">Kids (TV-Y)</SelectItem>
                    <SelectItem value="pg">PG</SelectItem>
                    <SelectItem value="pg-13">PG-13</SelectItem>
                    <SelectItem value="r">R</SelectItem>
                    <SelectItem value="tvma">TV-MA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Categories</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {allCategories?.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`cat-${cat.id}`}
                    checked={form.categoryIds.includes(cat.id)}
                    onCheckedChange={() => toggleCategory(cat.id)}
                  />
                  <label htmlFor={`cat-${cat.id}`} className="text-sm text-foreground cursor-pointer">{cat.name}</label>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Video"}
            </Button>
            {!isNew && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => validateMutation.mutate({ id: videoId })}
                disabled={validateMutation.isPending}
              >
                <ShieldCheck className="h-4 w-4" />
                {validateMutation.isPending ? "Validating..." : "Validate for Feed"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
