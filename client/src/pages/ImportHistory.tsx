import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  History,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Upload,
  FileText,
  User,
  Calendar,
  BarChart3,
} from "lucide-react";
import { Link, useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportLog {
  id: number;
  filename: string;
  csvS3Key: string | null;
  csvUrl: string | null;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  errorCount: number;
  resultsJson: unknown;
  defaultChannelSlug: string | null;
  defaultCategorySlug: string | null;
  importedBy: number | null;
  importedByName: string | null;
  createdAt: Date;
}

interface RowResult {
  rowIndex: number;
  title: string;
  status: "imported" | "skipped" | "duplicate" | "error";
  reason?: string;
  videoId?: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function RowStatusBadge({ status }: { status: string }) {
  if (status === "imported")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 text-xs">
        <CheckCircle2 className="w-3 h-3" /> imported
      </Badge>
    );
  if (status === "skipped")
    return (
      <Badge className="bg-muted/50 text-muted-foreground gap-1 text-xs">
        <AlertTriangle className="w-3 h-3" /> skipped
      </Badge>
    );
  if (status === "duplicate")
    return (
      <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1 text-xs">
        <RefreshCw className="w-3 h-3" /> duplicate
      </Badge>
    );
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1 text-xs">
      <XCircle className="w-3 h-3" /> error
    </Badge>
  );
}

// ─── Log summary badges ───────────────────────────────────────────────────────
function LogSummaryBadges({ log }: { log: ImportLog }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {log.importedCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
          {log.importedCount} imported
        </span>
      )}
      {log.skippedCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
          {log.skippedCount} skipped
        </span>
      )}
      {log.duplicateCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
          {log.duplicateCount} dup
        </span>
      )}
      {log.errorCount > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
          {log.errorCount} errors
        </span>
      )}
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function LogDetailDrawer({
  logId,
  open,
  onClose,
}: {
  logId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const { data: log, isLoading } = trpc.import.getLog.useQuery(
    { id: logId! },
    { enabled: open && logId !== null }
  );

  const downloadCsv = () => {
    if (!log?.csvUrl) return;
    const a = document.createElement("a");
    a.href = log.csvUrl;
    a.download = log.filename;
    a.target = "_blank";
    a.click();
  };

  const handleReimport = () => {
    if (!log) return;
    onClose();
    navigate(`/import?reimportLogId=${log.id}`);
  };

  const results = (log?.resultsJson as RowResult[] | null) ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !log ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Loading…
          </div>
        ) : (
          <>
            <SheetHeader className="mb-6">
              <SheetTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {log.filename}
              </SheetTitle>
              <SheetDescription>
                Import run details and per-row results
              </SheetDescription>
            </SheetHeader>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </div>
                <p className="text-sm font-medium">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" /> Imported by
                </div>
                <p className="text-sm font-medium">{log.importedByName ?? "Unknown"}</p>
              </div>
              {log.defaultChannelSlug && (
                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Default Channel</div>
                  <p className="text-sm font-mono">{log.defaultChannelSlug}</p>
                </div>
              )}
              {log.defaultCategorySlug && (
                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Default Category</div>
                  <p className="text-sm font-mono">{log.defaultCategorySlug}</p>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <div className="rounded-lg border p-2.5 text-center">
                <p className="text-xl font-bold">{log.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-2.5 text-center">
                <p className="text-xl font-bold text-emerald-400">{log.importedCount}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-2.5 text-center">
                <p className="text-xl font-bold text-blue-400">{log.duplicateCount}</p>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
              <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-2.5 text-center">
                <p className="text-xl font-bold text-red-400">{log.errorCount}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>

            {/* CSV actions — Re-import is the primary CTA */}
            <div className="flex gap-2 mb-2">
              <Button
                onClick={handleReimport}
                className="flex-1 gap-2 font-semibold"
                title="Load this CSV into the Import page to fix errors and re-run"
              >
                <RefreshCw className="w-4 h-4" />
                Re-import CSV
              </Button>
              {log.csvUrl ? (
                <Button onClick={downloadCsv} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              ) : (
                <Button variant="outline" disabled className="gap-2 opacity-50">
                  <Download className="w-4 h-4" />
                  No CSV
                </Button>
              )}
            </div>
            {!log.csvUrl && (
              <p className="text-xs text-muted-foreground mb-4">
                CSV file not available — storage upload may have failed for this run.
              </p>
            )}

            {/* Per-row results */}
            {results.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Per-row Results
                </h3>
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-y-auto max-h-96">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r) => (
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
                            <TableCell className="font-medium max-w-[160px] truncate text-sm">
                              {r.title}
                            </TableCell>
                            <TableCell>
                              <RowStatusBadge status={r.status} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
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
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ImportHistory() {
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.import.listLogs.useQuery({ limit: 100 });

  const deleteMutation = trpc.import.deleteLog.useMutation({
    onSuccess: () => {
      toast.success("Import log deleted");
      utils.import.listLogs.invalidate();
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const logs = data?.logs ?? [];

  const totalImported = logs.reduce((s, l) => s + l.importedCount, 0);
  const totalRuns = logs.length;
  const totalErrors = logs.reduce((s, l) => s + l.errorCount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/import">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Import
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <History className="w-6 h-6 text-primary" />
              Import History
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Audit log of all past bulk video imports. Re-download original CSV files or review per-row results.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Link href="/import">
              <Button size="sm" className="gap-2">
                <Upload className="w-4 h-4" />
                New Import
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary stats — responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalRuns}</p>
                  <p className="text-xs text-muted-foreground">Total Import Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{totalImported}</p>
                  <p className="text-xs text-muted-foreground">Total Videos Imported</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{totalErrors}</p>
                  <p className="text-xs text-muted-foreground">Total Errors Across Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Log table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Runs</CardTitle>
            <CardDescription>
              Click any row to view details and per-row results. Use the Re-import button to re-run a previous CSV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading import history…</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <History className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground font-medium">No import history yet</p>
                <p className="text-sm text-muted-foreground">
                  Your first bulk import will appear here automatically.
                </p>
                <Link href="/import">
                  <Button className="gap-2 mt-2">
                    <Upload className="w-4 h-4" />
                    Start First Import
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filename</TableHead>
                        <TableHead>Date</TableHead>
                        {/* "Imported by" hidden on small screens */}
                        <TableHead className="hidden md:table-cell">Imported by</TableHead>
                        <TableHead className="text-center">Rows</TableHead>
                        <TableHead>Results</TableHead>
                        {/* "CSV" column merged into Actions on small screens */}
                        <TableHead className="hidden sm:table-cell text-center">CSV</TableHead>
                        <TableHead className="w-28 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setSelectedLogId(log.id)}
                        >
                          {/* Filename */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="font-medium max-w-[160px] truncate text-sm">
                                {log.filename}
                              </span>
                            </div>
                          </TableCell>

                          {/* Date */}
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleDateString()}{" "}
                            <span className="hidden lg:inline text-xs">
                              {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </TableCell>

                          {/* Imported by (hidden on small) */}
                          <TableCell className="text-sm hidden md:table-cell">
                            {log.importedByName ?? "—"}
                          </TableCell>

                          {/* Total rows */}
                          <TableCell className="text-sm font-mono text-center">{log.totalRows}</TableCell>

                          {/* Results summary */}
                          <TableCell>
                            <LogSummaryBadges log={log as ImportLog} />
                          </TableCell>

                          {/* CSV download (hidden on xs) */}
                          <TableCell className="hidden sm:table-cell text-center">
                            {log.csvUrl ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary hover:text-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const a = document.createElement("a");
                                      a.href = log.csvUrl!;
                                      a.download = log.filename;
                                      a.target = "_blank";
                                      a.click();
                                    }}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download CSV</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell>
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setSelectedLogId(log.id)}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View details</TooltipContent>
                              </Tooltip>

                              {/* Re-import — primary action, uses solid button */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="default"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => navigate(`/import?reimportLogId=${log.id}`)}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Re-import from this CSV</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteTargetId(log.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete log</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail drawer */}
      <LogDetailDrawer
        logId={selectedLogId}
        open={selectedLogId !== null}
        onClose={() => setSelectedLogId(null)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(v) => !v && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete import log?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the log record and the stored CSV file reference. The videos that were
              imported will <strong>not</strong> be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })}
            >
              Delete Log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
