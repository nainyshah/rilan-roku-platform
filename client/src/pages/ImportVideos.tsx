import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
  History as HistoryIcon,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedRow {
  rowIndex: number;
  data: Record<string, string | number | undefined>;
  status: "valid" | "warning" | "error";
  issues: string[];
}

interface ImportResult {
  rowIndex: number;
  title: string;
  status: "imported" | "skipped" | "duplicate" | "error";
  reason?: string;
  videoId?: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "valid" || status === "imported")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        {status}
      </Badge>
    );
  if (status === "warning")
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
        <AlertTriangle className="w-3 h-3" />
        warning
      </Badge>
    );
  if (status === "duplicate")
    return (
      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
        <RefreshCw className="w-3 h-3" />
        duplicate
      </Badge>
    );
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
      <XCircle className="w-3 h-3" />
      {status}
    </Badge>
  );
}

// ─── Expandable issues cell ───────────────────────────────────────────────────
function IssuesCell({ issues }: { issues: string[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
      >
        {issues.length} issue{issues.length > 1 ? "s" : ""}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {issues.map((issue, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              • {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ImportVideos() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [defaultChannelSlug, setDefaultChannelSlug] = useState<string>("none");
  const [defaultCategorySlug, setDefaultCategorySlug] = useState<string>("none");
  const [skipErrors, setSkipErrors] = useState(true);
  const [reimportBanner, setReimportBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for ?reimportLogId= query param (set by Import History page)
  const reimportLogId = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("reimportLogId");
    return v ? parseInt(v, 10) : null;
  })();

  const { data: channels } = trpc.channels.list.useQuery({});
  const { data: categories } = trpc.categories.list.useQuery(undefined);
  const { data: templateData } = trpc.import.getTemplate.useQuery();

  // Fetch re-import data when a log ID is present in the URL
  const { data: reimportData, isLoading: reimportLoading, error: reimportError } =
    trpc.import.getReimportData.useQuery(
      { id: reimportLogId! },
      { enabled: reimportLogId !== null }
    );

  // When re-import data arrives, pre-populate the CSV state
  useEffect(() => {
    if (!reimportData) return;
    setCsvText(reimportData.csvText);
    setFileName(reimportData.filename);
    setParsedRows(null);
    setImportResults(null);
    if (reimportData.defaultChannelSlug) setDefaultChannelSlug(reimportData.defaultChannelSlug);
    if (reimportData.defaultCategorySlug) setDefaultCategorySlug(reimportData.defaultCategorySlug);
    setReimportBanner(reimportData.filename);
  }, [reimportData]);

  useEffect(() => {
    if (reimportError) {
      toast.error(`Could not load CSV: ${reimportError.message}`);
    }
  }, [reimportError]);

  const parseMutation = trpc.import.parsePreview.useMutation({
    onSuccess: (data) => {
      setParsedRows(data.rows as ParsedRow[]);
      setImportResults(null);
      toast.success(`Parsed ${data.total} rows — ${data.validCount} valid, ${data.warningCount} warnings, ${data.errorCount} errors`);
    },
    onError: (err) => toast.error(`Parse failed: ${err.message}`),
  });

  const importMutation = trpc.import.bulkImport.useMutation({
    onSuccess: (data) => {
      setImportResults(data.results as ImportResult[]);
      toast.success(
        `Import complete: ${data.importedCount} imported, ${data.skippedCount} skipped, ${data.errorCount} errors`
      );
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  // ─── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      setParsedRows(null);
      setImportResults(null);
    };
    reader.readAsText(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  // ─── Download template ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    if (!templateData) return;
    const blob = new Blob([templateData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rilan-video-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Parse ──────────────────────────────────────────────────────────────────
  const handleParse = () => {
    if (!csvText) return;
    parseMutation.mutate({ csvText });
  };

  // ─── Import ─────────────────────────────────────────────────────────────────
  const handleImport = () => {
    if (!csvText) return;
    importMutation.mutate({
      csvText,
      filename: fileName || "import.csv",
      defaultChannelSlug: defaultChannelSlug === "none" ? undefined : defaultChannelSlug,
      defaultCategorySlug: defaultCategorySlug === "none" ? undefined : defaultCategorySlug,
      skipErrors,
    });
  };

  // ─── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setCsvText(null);
    setFileName("");
    setParsedRows(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stats = parsedRows
    ? {
        valid: parsedRows.filter((r) => r.status === "valid").length,
        warning: parsedRows.filter((r) => r.status === "warning").length,
        error: parsedRows.filter((r) => r.status === "error").length,
        total: parsedRows.length,
      }
    : null;

  const importStats = importResults
    ? {
        imported: importResults.filter((r) => r.status === "imported").length,
        skipped: importResults.filter((r) => r.status === "skipped").length,
        duplicate: importResults.filter((r) => r.status === "duplicate").length,
        error: importResults.filter((r) => r.status === "error").length,
      }
    : null;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Re-import loading overlay */}
        {reimportLoading && reimportLogId && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading CSV from import history...
          </div>
        )}

        {/* Re-import banner */}
        {reimportBanner && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <HistoryIcon className="w-4 h-4" />
              <span>Re-importing from: <span className="font-mono font-medium">{reimportBanner}</span></span>
            </div>
            <button
              onClick={() => {
                setReimportBanner(null);
                handleReset();
                // Clear the query param without navigation
                window.history.replaceState({}, "", window.location.pathname);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              × Clear
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/videos">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Videos
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Bulk Video Import</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CSV file to import multiple videos at once into your Roku channels.
            </p>
          </div>
          <Link href="/import/history">
            <Button variant="outline" size="sm" className="gap-2">
              <HistoryIcon className="w-4 h-4" />
              View History
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Download Template
          </Button>
        </div>

        {/* Step 1: Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
              Upload CSV File
            </CardTitle>
            <CardDescription>
              Upload a CSV with columns: title, description, thumbnailUrl, streamUrl, durationSeconds, language, contentType, contentRating, releaseDate, rightsOwner, tags, publishStatus, channelSlug, categorySlug
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : csvText
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileChange}
              />
              {csvText ? (
                <div className="space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <p className="font-medium text-emerald-400">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {csvText.split("\n").length - 1} data rows detected
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">Drop your CSV here or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .csv files only</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleParse}
                disabled={!csvText || parseMutation.isPending}
                className="gap-2"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Parse & Validate
              </Button>
              {csvText && (
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Preview & Configure */}
        {parsedRows && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                Preview & Configure Import
              </CardTitle>
              <CardDescription>
                Review parsed rows, set default channel/category, then run the import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Summary stats */}
              {stats && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                  </div>
                  <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{stats.valid}</p>
                    <p className="text-xs text-muted-foreground">Valid</p>
                  </div>
                  <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{stats.warning}</p>
                    <p className="text-xs text-muted-foreground">Warnings</p>
                  </div>
                  <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{stats.error}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}

              {/* Default assignment */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/20">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Channel</label>
                  <p className="text-xs text-muted-foreground">Applied when row has no channelSlug</p>
                  <Select value={defaultChannelSlug} onValueChange={setDefaultChannelSlug}>
                    <SelectTrigger>
                      <SelectValue placeholder="No default channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default channel</SelectItem>
                      {channels?.map((ch: any) => (
                        <SelectItem key={ch.id} value={ch.slug}>
                          {ch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Category</label>
                  <p className="text-xs text-muted-foreground">Applied when row has no categorySlug</p>
                  <Select value={defaultCategorySlug} onValueChange={setDefaultCategorySlug}>
                    <SelectTrigger>
                      <SelectValue placeholder="No default category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default category</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.slug}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Skip errors toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipErrors}
                  onChange={(e) => setSkipErrors(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">
                  Skip rows with errors{" "}
                  <span className="text-muted-foreground">(uncheck to abort on first error)</span>
                </span>
              </label>

              {/* Preview table */}
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Stream URL</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row) => (
                        <TableRow
                          key={row.rowIndex}
                          className={
                            row.status === "error"
                              ? "bg-red-500/5"
                              : row.status === "warning"
                              ? "bg-amber-500/5"
                              : ""
                          }
                        >
                          <TableCell className="text-muted-foreground text-xs">{row.rowIndex}</TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate">
                            {String(row.data.title ?? "—")}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                            {String(row.data.streamUrl ?? "—")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.data.durationSeconds ? `${row.data.durationSeconds}s` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{String(row.data.contentType ?? "clip")}</TableCell>
                          <TableCell className="text-xs">
                            {String(row.data.channelSlug ?? defaultChannelSlug === "none" ? "—" : defaultChannelSlug)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell>
                            <IssuesCell issues={row.issues} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || stats?.total === 0}
                className="gap-2 w-full sm:w-auto"
                size="lg"
              >
                {importMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importMutation.isPending
                  ? "Importing…"
                  : `Import ${stats?.valid ?? 0 + (stats?.warning ?? 0)} Videos`}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
        {importResults && importStats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">3</span>
                Import Results
              </CardTitle>
              <CardDescription>
                {importStats.imported} videos imported successfully.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Result stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importStats.imported}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold">{importStats.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{importStats.duplicate}</p>
                  <p className="text-xs text-muted-foreground">Duplicates</p>
                </div>
                <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{importStats.error}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              {/* Results table */}
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.map((r) => (
                        <TableRow
                          key={r.rowIndex}
                          className={
                            r.status === "imported"
                              ? "bg-emerald-500/5"
                              : r.status === "error"
                              ? "bg-red-500/5"
                              : ""
                          }
                        >
                          <TableCell className="text-muted-foreground text-xs">{r.rowIndex}</TableCell>
                          <TableCell className="font-medium">{r.title}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.status === "imported"
                              ? `Video ID: ${r.videoId}`
                              : r.reason ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href="/videos">
                  <Button className="gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    View Videos
                  </Button>
                </Link>
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
