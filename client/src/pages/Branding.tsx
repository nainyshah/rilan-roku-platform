import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Image, Upload, Trash2, Radio, ExternalLink } from "lucide-react";
import { useState, useRef } from "react";

const ASSET_TYPES = [
  { value: "logo", label: "Logo", desc: "Channel logo (PNG, transparent bg recommended)" },
  { value: "splash", label: "Splash Screen", desc: "Loading splash image (1920×1080)" },
  { value: "hd_icon", label: "HD Icon", desc: "HD channel icon (336×210)" },
  { value: "fhd_icon", label: "FHD Icon", desc: "FHD channel icon (672×420)" },
  { value: "screenshot", label: "Screenshot", desc: "App store screenshot" },
  { value: "hero_banner", label: "Hero Banner", desc: "Hero/banner image (1920×1080)" },
  { value: "background", label: "Background", desc: "Channel background image" },
] as const;

export default function Branding() {
  const { data: channels } = trpc.channels.list.useQuery({});
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<string>("logo");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assets, refetch: refetchAssets } = trpc.branding.list.useQuery(
    { channelId: selectedChannelId! },
    { enabled: !!selectedChannelId }
  );

  const uploadMutation = trpc.branding.upload.useMutation({
    onSuccess: () => { toast.success("Asset uploaded"); refetchAssets(); setUploading(false); },
    onError: (e) => { toast.error(e.message); setUploading(false); },
  });

  const deleteMutation = trpc.branding.delete.useMutation({
    onSuccess: () => { toast.success("Asset deleted"); refetchAssets(); },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        channelId: selectedChannelId,
        assetType: selectedAssetType as any,
        fileDataBase64: base64!,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const groupedAssets = ASSET_TYPES.map((type) => ({
    ...type,
    assets: assets?.filter((a) => a.assetType === type.value) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Branding Assets</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload and manage channel-specific branding assets</p>
      </div>

      {/* Channel Selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1 flex-1 min-w-48">
              <Label>Select Channel</Label>
              <Select value={selectedChannelId ? String(selectedChannelId) : ""} onValueChange={(v) => setSelectedChannelId(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a channel..." />
                </SelectTrigger>
                <SelectContent>
                  {channels?.map((ch) => (
                    <SelectItem key={ch.id} value={String(ch.id)}>
                      <div className="flex items-center gap-2">
                        <Radio className="h-3 w-3 text-primary" />
                        {ch.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedChannelId && (
              <>
                <div className="space-y-1 flex-1 min-w-48">
                  <Label>Asset Type</Label>
                  <Select value={selectedAssetType} onValueChange={setSelectedAssetType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 pt-5">
                  <Button
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload Asset"}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Asset Grid */}
      {!selectedChannelId ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a channel to manage its branding assets.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedAssets.map((group) => (
            <Card key={group.value} className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{group.label}</span>
                  <span className="text-xs text-muted-foreground font-normal">{group.desc}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {group.assets.length === 0 ? (
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => { setSelectedAssetType(group.value); fileInputRef.current?.click(); }}
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Click to upload {group.label}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.assets.map((asset) => (
                      <div key={asset.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group">
                        <img
                          src={asset.fileUrl}
                          alt={asset.assetType}
                          className="h-12 w-20 object-cover rounded border border-border"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{asset.fileName ?? asset.assetType}</p>
                          <p className="text-xs text-muted-foreground">{asset.mimeType}</p>
                          {asset.fileSizeBytes && (
                            <p className="text-xs text-muted-foreground">{(asset.fileSizeBytes / 1024).toFixed(1)} KB</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={asset.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </a>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                            onClick={() => deleteMutation.mutate({ assetId: asset.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-2 h-8"
                      onClick={() => { setSelectedAssetType(group.value); fileInputRef.current?.click(); }}
                    >
                      <Upload className="h-3 w-3" /> Replace / Add Another
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
