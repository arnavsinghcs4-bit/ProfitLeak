import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import {
  uploadFile,
  createDataset,
  runAnalysis,
  listDatasets,
  deleteDataset,
  loadSample,
} from "@/lib/api";
import type {
  PreviewResponse,
  ValidationResponse,
  ValidationIssue,
  DatasetMeta,
} from "@/types/api";
import { fmtBytes, fmtCount, fmtDate } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Trash2,
  ArrowRight,
  Database,
  Loader2,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";

const EXPECTED_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "sales", label: "Sales (gross sales)", required: true },
  { key: "discount", label: "Discount % (0–1 decimal)" },
  { key: "quantity", label: "Quantity" },
  { key: "order_id", label: "Order ID" },
  { key: "order_date", label: "Order Date" },
  { key: "ship_date", label: "Ship Date" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub-Category" },
  { key: "product_name", label: "Product Name" },
  { key: "region", label: "Region" },
  { key: "segment", label: "Segment" },
  { key: "unit_cost", label: "Unit Cost (optional)" },
  { key: "shipping_cost", label: "Shipping Cost (optional)" },
  { key: "returned", label: "Returned Flag (optional)" },
];

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function DataSources() {
  const { sessionId, setSession, refreshSummary } = useSession();
  const navigate = useNavigate();
  const showToast = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Upload & preview state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  // Validation & analysis state
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Datasets list
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  const [loadingSample, setLoadingSample] = useState(false);

  const loadDatasetList = useCallback(async () => {
    setLoadingDatasets(true);
    try {
      const res = await listDatasets();
      setDatasets(res.datasets);
    } catch {
      // ignore
    } finally {
      setLoadingDatasets(false);
    }
  }, []);

  useEffect(() => {
    loadDatasetList();
  }, [loadDatasetList]);

  // Handle file selection
  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      showToast("Please upload a CSV or Excel file (.csv, .xlsx, .xls)", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("File exceeds the 20 MB size limit", "error");
      return;
    }

    setSelectedFile(file);
    setValidation(null);
    setAnalysisError(null);
    setUploading(true);

    try {
      const res = await uploadFile(file);
      setPreview(res);
      // initialize mapping with suggested mapping
      setMapping(res.suggested_mapping);
      showToast(`Loaded ${res.filename} (${fmtCount(res.row_count)} rows)`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to parse file", "error");
      setSelectedFile(null);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Validate mapping and create dataset session
  const handleValidateAndCreate = async () => {
    if (!selectedFile) return;
    setValidating(true);
    setAnalysisError(null);

    try {
      const res = await createDataset(selectedFile, mapping);
      setValidation(res);

      if (res.ok && res.session_id) {
        setSession(res.session_id);
        showToast("Dataset created and validated successfully", "success");
        loadDatasetList();
      } else {
        showToast("Validation issues found. Please review the errors below.", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Dataset validation failed", "error");
    } finally {
      setValidating(false);
    }
  };

  // Run analysis on the validated dataset
  const handleRunAnalysis = async () => {
    const targetSessionId = validation?.session_id || sessionId;
    if (!targetSessionId) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      await runAnalysis(targetSessionId, true);
      await refreshSummary();
      showToast("Analysis completed successfully", "success");
      loadDatasetList();
      navigate("/");
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
      showToast("Analysis encountered an error", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await loadSample();
      setSession(res.session_id, res.meta);
      await runAnalysis(res.session_id, true);
      await refreshSummary();
      showToast("Loaded and analyzed sample dataset (10,000 orders)", "success");
      loadDatasetList();
      navigate("/");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load sample", "error");
    } finally {
      setLoadingSample(false);
    }
  };

  const handleDeleteDataset = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this dataset session?")) return;
    try {
      await deleteDataset(sid);
      showToast("Dataset removed", "info");
      loadDatasetList();
    } catch (err) {
      showToast("Failed to delete dataset", "error");
    }
  };

  return (
    <div className="px-6 lg:px-8 py-8 space-y-8 max-w-6xl mx-auto">
      <PageHeader
        title="Data Sources & Ingestion"
        description="Import order datasets in CSV or Excel format. Map columns, validate data consistency, and execute profitability analysis."
        actions={
          <button
            onClick={handleLoadSample}
            disabled={loadingSample}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border text-ink-muted rounded-md hover:text-ink hover:border-ink-faint transition-colors disabled:opacity-50"
          >
            {loadingSample ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
            Load sample dataset (10k orders)
          </button>
        }
      />

      {/* Step 1: Upload Dropzone */}
      <SectionCard>
        <SectionHeader
          title="1. Upload Dataset"
          description="Drag and drop a CSV or Excel (.xlsx) file up to 20 MB."
        />

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={clsx(
            "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors text-center",
            dragActive
              ? "border-accent bg-accent/5"
              : "border-border-subtle hover:border-border hover:bg-elevated/40"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 size={28} className="animate-spin text-accent" />
              <p className="text-sm font-medium text-ink-muted">Reading and parsing file...</p>
            </div>
          ) : selectedFile ? (
            <div className="flex flex-col items-center gap-1.5">
              <FileSpreadsheet size={32} className="text-accent" />
              <p className="text-sm font-semibold text-ink">{selectedFile.name}</p>
              <p className="text-2xs font-mono text-ink-faint">
                {fmtBytes(selectedFile.size)} · Click or drop another file to replace
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-full bg-elevated text-ink-muted">
                <Upload size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  Click to select or drag and drop order data
                </p>
                <p className="text-xs text-ink-faint mt-1">
                  Supports CSV, XLSX, XLS. One row per order or line item.
                </p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Step 2: Data Preview & Column Mapping */}
      {preview && (
        <SectionCard>
          <SectionHeader
            title="2. Column Mapping & Schema Alignment"
            description={`File contains ${fmtCount(preview.row_count)} rows and ${preview.columns.length} columns. Verify or adjust the mapping below.`}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {EXPECTED_FIELDS.map((field) => {
              const currentVal = mapping[field.key] ?? "";
              return (
                <div
                  key={field.key}
                  className="p-3 bg-canvas border border-border-subtle rounded-md flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                      {field.label}
                      {field.required && (
                        <span className="text-2xs text-loss font-mono uppercase">*req</span>
                      )}
                    </span>
                    {currentVal ? (
                      <CheckCircle2 size={13} className="text-gain shrink-0" />
                    ) : field.required ? (
                      <AlertCircle size={13} className="text-loss shrink-0" />
                    ) : null}
                  </div>

                  <select
                    value={currentVal}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value ? e.target.value : null,
                      }))
                    }
                    className="w-full text-xs bg-elevated border border-border rounded px-2 py-1.5 text-ink-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">— Unmapped —</option>
                    {preview.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Sample Rows Preview */}
          <div className="mb-6">
            <p className="text-2xs font-mono uppercase tracking-widest text-ink-faint mb-2">
              Raw Data Preview (First 5 Rows)
            </p>
            <div className="overflow-x-auto border border-border-subtle rounded-md max-h-56">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-canvas sticky top-0">
                  <tr className="border-b border-border-subtle">
                    {preview.columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-2xs font-mono text-ink-faint whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample_rows.map((row, i) => (
                    <tr key={i} className="border-b border-border-subtle/40 hover:bg-elevated/20">
                      {preview.columns.map((col) => (
                        <td
                          key={col}
                          className="px-3 py-1.5 text-ink-muted whitespace-nowrap max-w-[200px] truncate"
                        >
                          {String(row[col] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleValidateAndCreate}
              disabled={validating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-accent text-canvas rounded-md hover:bg-accent-dim transition-colors disabled:opacity-50"
            >
              {validating && <Loader2 size={13} className="animate-spin" />}
              Validate & Prepare Dataset
            </button>
          </div>
        </SectionCard>
      )}

      {/* Step 3: Validation Feedback & Execution */}
      {validation && (
        <SectionCard>
          <SectionHeader
            title="3. Data Quality & Execution"
            description="Automated audit of numeric limits, null rates, date parsing, and cost assumptions."
          />

          <div className="space-y-4 mb-6">
            {/* Assumptions */}
            {validation.assumptions.length > 0 && (
              <div className="p-4 bg-canvas border border-border-subtle rounded-lg space-y-1.5">
                <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Info size={14} className="text-accent" />
                  Cost & Financial Assumptions
                </p>
                <ul className="text-xs text-ink-muted space-y-1 pl-5 list-disc">
                  {validation.assumptions.map((asm, i) => (
                    <li key={i}>{asm}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Issues */}
            {validation.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-2xs font-mono uppercase tracking-widest text-ink-faint">
                  Quality Audit Findings
                </p>
                <div className="space-y-2">
                  {validation.issues.map((issue, i) => (
                    <div
                      key={i}
                      className={clsx(
                        "flex items-start gap-2.5 p-3 rounded-md border text-xs",
                        issue.severity === "error"
                          ? "bg-loss/10 border-loss/30 text-loss"
                          : issue.severity === "warning"
                          ? "bg-warn/10 border-warn/30 text-warn"
                          : "bg-surface border-border text-ink-muted"
                      )}
                    >
                      {issue.severity === "error" ? (
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      ) : (
                        <Info size={15} className="shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <span className="font-semibold uppercase tracking-wider font-mono mr-1.5 text-2xs">
                          [{issue.severity}]
                        </span>
                        {issue.field && (
                          <span className="font-mono text-ink font-semibold mr-1.5">
                            {issue.field}:
                          </span>
                        )}
                        <span>{issue.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisError && <ErrorState message={analysisError} />}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
            <span className="text-xs text-ink-faint font-mono">
              Status: {validation.ok ? "Ready for analytics execution" : "Requires schema correction"}
            </span>
            <button
              onClick={handleRunAnalysis}
              disabled={!validation.ok || analyzing}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-accent text-canvas rounded-md hover:bg-accent-dim transition-colors disabled:opacity-40"
            >
              {analyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Running Analytics Engine...
                </>
              ) : (
                <>
                  Execute ProfitLeak Analysis
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </SectionCard>
      )}

      {/* Existing Sessions / Datasets */}
      <SectionCard>
        <SectionHeader
          title="Active & Stored Dataset Sessions"
          description="In-memory analysis sessions isolated per upload. Selecting a session makes it active across all analytical views."
        />

        {loadingDatasets ? (
          <LoadingSkeleton rows={4} cols={5} />
        ) : datasets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-subtle">
                  {["Name", "Source", "Rows", "Status", "Analyzed At", "Actions"].map((h) => (
                    <th
                      key={h}
                      className={clsx(
                        "px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint",
                        h === "Actions" ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => {
                  const isActive = sessionId === d.session_id;
                  return (
                    <tr
                      key={d.session_id}
                      onClick={() => {
                        setSession(d.session_id, d);
                        showToast(`Switched active session to: ${d.name}`, "info");
                      }}
                      className={clsx(
                        "border-b border-border-subtle/40 hover:bg-elevated/30 cursor-pointer transition-colors",
                        isActive && "bg-elevated/50 font-medium"
                      )}
                    >
                      <td className="px-3 py-3 text-ink">
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          )}
                          <span className="truncate max-w-xs">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-faint font-mono">{d.source}</td>
                      <td className="px-3 py-3 tabular-nums text-ink-muted">
                        {fmtCount(d.row_count)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          tone={
                            d.status === "analyzed"
                              ? "gain"
                              : d.status === "error"
                              ? "loss"
                              : d.status === "processing"
                              ? "warn"
                              : "default"
                          }
                        >
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-ink-faint font-mono">
                        {fmtDate(d.analyzed_at)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={(e) => handleDeleteDataset(d.session_id, e)}
                          title="Delete session"
                          className="p-1 text-ink-faint hover:text-loss transition-colors rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No datasets uploaded yet"
            description="Upload an order data file above or load the sample dataset."
          />
        )}
      </SectionCard>
    </div>
  );
}
