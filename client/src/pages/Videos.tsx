import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Film, AlertTriangle, CheckCircle, Clock, FileText, Edit, Trash2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    approved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    draft: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    archived: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}

function ValidationBadge({ status }: { status: string | null }) {
  if (!status || status === "unchecked") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    valid: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-red-400",
  };
  const icons: Record<string, React.ReactNode> = {
    valid: <CheckCircle className="h-3.5 w-3.5" />,
    warning: <AlertTriangle className="h-3.5 w-3.5" />,
    error: <AlertTriangle className="h-3.5 w-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${map[status] ?? ""}`}>
      {icons[status]} {status}
    </span>
  );
}

export default function Videos() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.videos.list.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 20,
  });

  const setStatusMutation = trpc.videos.setStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const validateMutation = trpc.videos.validate.useMutation({
    onSuccess: (r) => { toast.success(`Validation: ${r.status}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Videos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} total videos
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setLocation("/videos/new")}>
          <Plus className="h-4 w-4" /> Add Video
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Film className="h-8 w-8 mx-auto mb-2 animate-pulse opacity-40" />
              <p className="text-sm">Loading videos...</p>
            </div>
          ) : data?.items.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No videos found.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/videos/new")}>
                Add your first video
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 w-12"></th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Title</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Type</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Status</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden lg:table-cell">Validation</th>
                    <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden lg:table-cell">Duration</th>
                    <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((video) => (
                    <tr key={video.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        {video.thumbnailUrl ? (
                          <img src={video.thumbnailUrl} alt="" className="h-8 w-12 object-cover rounded" />
                        ) : (
                          <div className="h-8 w-12 bg-muted rounded flex items-center justify-center">
                            <Film className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-xs">{video.title}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{video.slug}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">{video.contentType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={video.publishStatus} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <ValidationBadge status={video.validationStatus} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {video.durationSeconds ? `${Math.floor(video.durationSeconds / 60)}m ${video.durationSeconds % 60}s` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Validate"
                            onClick={() => validateMutation.mutate({ id: video.id })}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Edit"
                            onClick={() => setLocation(`/videos/${video.id}`)}
                          >
                            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Select
                            value={video.publishStatus}
                            onValueChange={(v) => setStatusMutation.mutate({ id: video.id, status: v as any })}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="published">Published</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({data?.total} videos)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
