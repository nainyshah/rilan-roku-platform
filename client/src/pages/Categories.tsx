import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, FolderOpen, Edit, Save } from "lucide-react";
import { useState } from "react";

export default function Categories() {
  const { data: categories, isLoading, refetch } = trpc.categories.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [editForm, setEditForm] = useState<Record<number, { name: string; description: string }>>({});

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => { toast.success("Category created"); setOpen(false); setForm({ name: "", description: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => { toast.success("Category updated"); setEditId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage content categories for channel rows
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> New Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Latest Episodes" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Category description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <Button
                className="w-full"
                disabled={!form.name || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-5 h-24" />
            </Card>
          ))}
        </div>
      ) : categories?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No categories yet. Create your first category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories?.map((cat) => (
            <Card key={cat.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                {editId === cat.id ? (
                  <div className="space-y-3">
                    <Input
                      value={editForm[cat.id]?.name ?? cat.name}
                      onChange={(e) => setEditForm({ ...editForm, [cat.id]: { ...editForm[cat.id], name: e.target.value, description: editForm[cat.id]?.description ?? cat.description ?? "" } })}
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={editForm[cat.id]?.description ?? cat.description ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, [cat.id]: { ...editForm[cat.id], description: e.target.value, name: editForm[cat.id]?.name ?? cat.name } })}
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs gap-1"
                        onClick={() => updateMutation.mutate({ id: cat.id, ...editForm[cat.id] })}
                        disabled={updateMutation.isPending}
                      >
                        <Save className="h-3 w-3" /> Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-sm font-semibold text-foreground">{cat.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cat.isActive}
                          onCheckedChange={(v) => updateMutation.mutate({ id: cat.id, isActive: v })}
                          className="scale-75"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            setEditId(cat.id);
                            setEditForm({ ...editForm, [cat.id]: { name: cat.name, description: cat.description ?? "" } });
                          }}
                        >
                          <Edit className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mb-2">{cat.slug}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {cat.description || "No description"}
                    </p>
                    <div className="mt-3">
                      <span className={`text-xs px-2 py-0.5 rounded border ${cat.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                        {cat.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
