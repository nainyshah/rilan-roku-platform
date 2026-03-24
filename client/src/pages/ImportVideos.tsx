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
  ImageOff,
  Image,
  Eye,
  EyeOff,
  VideoOff,
  Video,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ThumbnailCheck {
  url: string;
  status: string;
  httpStatus?: number;
  contentType?: string;
  message: string;
  isWarning: boolean;
}

interface ParsedRow {
  rowIndex: number;
  data: Record<string, string | number | undefined>;
  status: "valid" | "warning" | "error";
  issues: string[];
  thumbnailCheck?: ThumbnailCheck;
}

interface ThumbnailValidationSummary {
  checked: number;
  warnings: number;
  skipped: number;
}

interface StreamCheck {
  url: string;
  status: string;
  httpStatus?: number;
  contentType?: string;
  message: string;
  isWarning: boolean;
}

interface StreamValidationSummary {
  checked: number;
  warnings: number;
  skipped: number;
}

interface ImportResult {
  rowIndex: number;
  title: string;
  status: "imported" | "skipped" | "duplicate" | "error";
  reason?: string;
  videoId?: number;
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({
  steps,
  current,
}: {
  steps: { label: string; description: string }[];
  current: number; // 0-based index of the active step
}) {
  return (
    <div className="flex items-start gap-0 mb-6">
      {steps.map((step, i) => {
        const isComplete = i < current;
        const isActive = i === current;
        return (
          <div key={i} className="flex items-start flex-1 min-w-0">
            {/* Step node */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  isComplete
                    ? "bg-primary border-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/30 border-border text-muted-foreground"
                }`}
              >
                {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <div className="mt-1.5 text-center px-1">
                <p className={`text-xs font-medium leading-tight ${isActive ? "text-foreground" : isComplete ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5 hidden sm:block">
                  {step.description}
                </p>
              </div>
            </div>
            {/* Connector line (not after last step) */}
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mt-4 mx-1 transition-colors ${i < current ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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

// ─── Thumbnail status icon ────────────────────────────────────────────────────
function ThumbnailStatusCell({ check }: { check?: ThumbnailCheck }) {
  if (!check) return <span className="text-muted-foreground text-xs">—</span>;
  if (!check.isWarning)
    return (
      <span title="Thumbnail OK" className="flex items-center gap-1 text-xs text-emerald-400">
        <Image className="w-3.5 h-3.5" />
        OK
      </span>
    );
  const label =
    check.status === "not_found"
      ? "404"
      : check.status === "timeout"
      ? "Timeout"
      : check.status === "forbidden"
      ? "403"
      : check.status === "bad_content"
      ? "Not image"
      : check.status === "invalid_url"
      ? "Bad URL"
      : check.status === "server_error"
      ? `${check.httpStatus ?? "5xx"}`
      : "Error";
  return (
    <span title={check.message} className="flex items-center gap-1 text-xs text-amber-400 cursor-help">
      <ImageOff className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ─── Stream URL status icon ─────────────────────────────────────────────────
function StreamStatusCell({ check }: { check?: StreamCheck }) {
  if (!check) return <span className="text-muted-foreground text-xs">—</span>;
  if (!check.isWarning)
    return (
      <span title="Stream URL OK" className="flex items-center gap-1 text-xs text-emerald-400">
        <Video className="w-3.5 h-3.5" />
        OK
      </span>
    );
  const label =
    check.status === "not_found"
      ? "404"
      : check.status === "timeout"
      ? "Timeout"
      : check.status === "forbidden"
      ? "403"
      : check.status === "bad_content"
      ? "Not video"
      : check.status === "ok_unknown_type"
      ? "Unknown type"
      : check.status === "invalid_url"
      ? "Bad URL"
      : check.status === "server_error"
      ? `${check.httpStatus ?? "5xx"}`
      : "Error";
  return (
    <span title={check.message} className="flex items-center gap-1 text-xs text-amber-400 cursor-help">
      <VideoOff className="w-3.5 h-3.5" />
      {label}
    </span>
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
  const [validateThumbnails, setValidateThumbnails] = useState(true);
  const [validateStreamUrls, setValidateStreamUrls] = useState(true);
  const [thumbnailSummary, setThumbnailSummary] = useState<ThumbnailValidationSummary | null>(null);
  const [streamSummary, setStreamSummary] = useState<StreamValidationSummary | null>(null);
  const [reimportBanner, setReimportBanner] = useState<string | null>(null);
  const [resultsFilter, setResultsFilter] = useState<"all" | "imported" | "error" | "duplicate" | "skipped">("all");
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
    setThumbnailSummary(null);
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
      setThumbnailSummary(data.thumbnailValidation ?? null);
      setStreamSummary(data.streamValidation ?? null);
      const thumbMsg =
        data.thumbnailValidation?.warnings
          ? ` — ${data.thumbnailValidation.warnings} thumbnail warning${data.thumbnailValidation.warnings > 1 ? "s" : ""}`
          : "";
      const streamMsg =
        data.streamValidation?.warnings
          ? `, ${data.streamValidation.warnings} stream warning${data.streamValidation.warnings > 1 ? "s" : ""}`
          : "";
      toast.success(
        `Parsed ${data.total} rows — ${data.validCount} valid, ${data.warningCount} warnings, ${data.errorCount} errors${thumbMsg}${streamMsg}`
      );
    },
    onError: (err) => toast.error(`Parse failed: ${err.message}`),
  });

  const importMutation = trpc.import.bulkImport.useMutation({
    onSuccess: (data) => {
      setImportResults(data.results as ImportResult[]);
      setResultsFilter("all");
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
      setThumbnailSummary(null);
      setStreamSummary(null);
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
    parseMutation.mutate({ csvText, validateThumbnails, validateStreamUrls });
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
    setThumbnailSummary(null);
    setStreamSummary(null);
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

  // Filtered import results
  const filteredImportResults = importResults
    ? resultsFilter === "all"
      ? importResults
      : importResults.filter((r) => r.status === resultsFilter)
    : [];

  // Whether any row has a thumbnail check result (to show the column)
  const hasThumbnailChecks = parsedRows?.some((r) => r.thumbnailCheck !== undefined) ?? false;
  // Whether any row has a stream check result (to show the column)
  const hasStreamChecks = parsedRows?.some((r) => (r as any).streamCheck !== undefined) ?? false;

  // Determine current step (0=upload, 1=preview, 2=results)
  const currentStep = importResults ? 2 : parsedRows ? 1 : 0;

  const STEPS = [
    { label: "Upload CSV", description: "Select or drop file" },
    { label: "Preview & Configure", description: "Review rows & settings" },
    { label: "Import Results", description: "See what was imported" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Re-import loading overlay */}
        {reimportLoading && reimportLogId && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading CSV from import history...
          </div>
        )}

        {/* Re-import banner */}
        {reimportBanner && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 overflow-hidden">
            {/* Banner header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <HistoryIcon className="w-4 h-4" />
                <span>
                  Re-importing from:{" "}
                  <span className="font-mono font-medium">{reimportBanner}</span>
                </span>
              </div>
              <button
                onClick={() => {
                  setReimportBanner(null);
                  handleReset();
                  window.history.replaceState({}, "", "/import");
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                × Clear
              </button>
            </div>
            {/* Channel / category override */}
            <div className="px-4 pb-4 border-t border-amber-500/20 pt-3">
              <p className="text-xs text-amber-300 font-medium mb-3">
                Override channel &amp; category assignment before re-running
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Default Channel</label>
                  <Select value={defaultChannelSlug} onValueChange={setDefaultChannelSlug}>
                    <SelectTrigger className="h-8 text-xs">
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
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Default Category</label>
                  <Select value={defaultCategorySlug} onValueChange={setDefaultCategorySlug}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No default category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default category</SelectItem>
                      {(categories as any[])?.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.slug}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These override the original import's defaults. Per-row channelSlug/categorySlug values in the CSV still take precedence.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/videos">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Videos
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Bulk Video Import</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CSV file to import multiple videos at once into your Roku channels.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/import/history">
              <Button variant="outline" size="sm" className="gap-2">
                <HistoryIcon className="w-4 h-4" />
                View History
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="w-4 h-4" />
              Template
            </Button>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={STEPS} current={currentStep} />

        {/* Step 1: Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                currentStep > 0 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
              }`}>
                {currentStep > 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : "1"}
              </span>
              Upload CSV File
            </CardTitle>
            <CardDescription>
              Upload a CSV with columns: title, description, thumbnailUrl, streamUrl,
              durationSeconds, language, contentType, contentRating, releaseDate, rightsOwner,
              tags, publishStatus, channelSlug, categorySlug
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-primary bg-primary/10 scale-[1.01]"
                  : csvText
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border hover:border-primary/60 hover:bg-muted/40"
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
                  <Upload className={`w-10 h-10 mx-auto transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <p className={`font-medium transition-colors ${isDragging ? "text-primary" : ""}`}>
                    {isDragging ? "Drop to upload" : "Drop your CSV here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground">Supports .csv files only</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
                {parseMutation.isPending
                  ? validateThumbnails || validateStreamUrls
                    ? "Validating URLs…"
                    : "Parsing…"
                  : "Parse & Validate"}
              </Button>
              {csvText && (
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </Button>
              )}
              {/* Validation toggles */}
              <div className="flex flex-wrap gap-4 ml-auto">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={validateThumbnails}
                    onChange={(e) => setValidateThumbnails(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm flex items-center gap-1.5">
                    {validateThumbnails ? (
                      <Eye className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    Check thumbnail URLs
                    <span className="text-muted-foreground text-xs">(~5s)</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={validateStreamUrls}
                    onChange={(e) => setValidateStreamUrls(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm flex items-center gap-1.5">
                    {validateStreamUrls ? (
                      <Video className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <VideoOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    Check stream URLs
                    <span className="text-muted-foreground text-xs">(~7s)</span>
                  </span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stream URL validation summary banners */}
        {streamSummary && streamSummary.warnings > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <VideoOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-400">
                {streamSummary.warnings} stream URL
                {streamSummary.warnings > 1 ? "s" : ""} may be unreachable
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {streamSummary.checked} stream URLs checked — {streamSummary.warnings} returned
                warnings (not found, wrong content-type, timeout, or server error). These rows are
                flagged as warnings. You can still import them, but the videos may not play in Roku.
              </p>
            </div>
          </div>
        )}
        {streamSummary && streamSummary.warnings === 0 && streamSummary.checked > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Video className="w-4 h-4 text-emerald-400" />
            <p className="text-sm text-emerald-400">
              All {streamSummary.checked} stream URL
              {streamSummary.checked > 1 ? "s" : ""} verified successfully.
            </p>
          </div>
        )}

        {/* Thumbnail validation summary banners */}
        {thumbnailSummary && thumbnailSummary.warnings > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <ImageOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-400">
                {thumbnailSummary.warnings} thumbnail URL
                {thumbnailSummary.warnings > 1 ? "s" : ""} may be broken
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {thumbnailSummary.checked} URLs checked — {thumbnailSummary.warnings} returned
                warnings (not found, wrong content-type, timeout, or server error). These rows are
                flagged as warnings. You can still import them, but the thumbnails may not display
                correctly in Roku.
              </p>
            </div>
          </div>
        )}
        {thumbnailSummary && thumbnailSummary.warnings === 0 && thumbnailSummary.checked > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Image className="w-4 h-4 text-emerald-400" />
            <p className="text-sm text-emerald-400">
              All {thumbnailSummary.checked} thumbnail URL
              {thumbnailSummary.checked > 1 ? "s" : ""} verified successfully.
            </p>
          </div>
        )}

        {/* Step 2: Preview & Configure */}
        {parsedRows && !importResults && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">
                  2
                </span>
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
                  <p className="text-xs text-muted-foreground">
                    Applied when row has no channelSlug
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Applied when row has no categorySlug
                  </p>
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
                  <span className="text-muted-foreground">
                    (uncheck to abort on first error)
                  </span>
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
                        {hasThumbnailChecks && <TableHead>Thumbnail</TableHead>}
                        {hasStreamChecks && <TableHead>Stream</TableHead>}
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
                          <TableCell className="text-muted-foreground text-xs">
                            {row.rowIndex}
                          </TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate">
                            {String(row.data.title ?? "—")}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                            {String(row.data.streamUrl ?? "—")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.data.durationSeconds ? `${row.data.durationSeconds}s` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {String(row.data.contentType ?? "clip")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {String(
                              row.data.channelSlug ??
                                (defaultChannelSlug === "none" ? "—" : defaultChannelSlug)
                            )}
                          </TableCell>
                          {hasThumbnailChecks && (
                            <TableCell>
                              <ThumbnailStatusCell check={row.thumbnailCheck} />
                            </TableCell>
                          )}
                          {hasStreamChecks && (
                            <TableCell>
                              <StreamStatusCell check={(row as any).streamCheck} />
                            </TableCell>
                          )}
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

              {/* Import button — prominent, full-width on mobile */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || stats?.total === 0}
                  size="lg"
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {importMutation.isPending
                    ? "Importing…"
                    : `Import ${(stats?.valid ?? 0) + (stats?.warning ?? 0)} Video${((stats?.valid ?? 0) + (stats?.warning ?? 0)) !== 1 ? "s" : ""}`}
                </Button>
                {stats && stats.error > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {stats.error} row{stats.error !== 1 ? "s" : ""} with errors will be{" "}
                    {skipErrors ? "skipped" : "cause the import to abort"}.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
        {importResults && importStats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
                Import Results
              </CardTitle>
              <CardDescription>
                {importStats.imported} video{importStats.imported !== 1 ? "s" : ""} imported successfully.
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

              {/* Results filter tabs */}
              <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit flex-wrap">
                {(["all", "imported", "error", "duplicate", "skipped"] as const).map((f) => {
                  const count =
                    f === "all"
                      ? importResults.length
                      : importResults.filter((r) => r.status === f).length;
                  if (f !== "all" && count === 0) return null;
                  return (
                    <button
                      key={f}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                        resultsFilter === f
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setResultsFilter(f)}
                    >
                      {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                    </button>
                  );
                })}
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
                      {filteredImportResults.map((r) => (
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
                          <TableCell className="text-muted-foreground text-xs">
                            {r.rowIndex}
                          </TableCell>
                          <TableCell className="font-medium">{r.title}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.status === "imported" ? `Video ID: ${r.videoId}` : r.reason ?? "—"}
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
