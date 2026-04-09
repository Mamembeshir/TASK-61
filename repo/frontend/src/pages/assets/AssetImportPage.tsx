import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  assetsApi,
  type Site,
  type ImportPreview,
  type ImportRow,
  type ImportCorrection,
  type ImportDecision,
  type ImportResult,
} from "@/api/assets";
import FileDropzone from "@/components/FileDropzone";
import StepWizard from "@/components/StepWizard";

const WIZARD_STEPS = [
  { label: "Upload" },
  { label: "Preview" },
  { label: "Corrections" },
  { label: "Decisions" },
  { label: "Confirm" },
  { label: "Results" },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  NEW:              { bg: "#d1e7dd", color: "#0a3622" },
  UPDATE_CANDIDATE: { bg: "#cfe2ff", color: "#084298" },
  DUPLICATE:        { bg: "#fff3cd", color: "#856404" },
  REJECTED:         { bg: "#f8d7da", color: "#842029" },
  BATCH_DUPLICATE:  { bg: "#ffe5d0", color: "#7d2d00" },
};

export default function AssetImportPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);

  // Step 0 — Upload
  const [file,    setFile]    = useState<File | null>(null);
  const [siteId,  setSiteId]  = useState("");
  const [sites,   setSites]   = useState<Site[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Step 1+ — Preview data
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Step 2 — Corrections (keyed by row_number → field → value)
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});

  // Step 3 — Decisions
  type ActionMap = Record<number, "create" | "update" | "skip">;
  const [decisions, setDecisions] = useState<ActionMap>({});

  // Step 4 — Confirming
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Step 5 — Results
  const [result, setResult] = useState<ImportResult | null>(null);

  // Polling for async jobs
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    assetsApi.listSites().then(setSites).catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Step 0: Upload
  // -------------------------------------------------------------------------

  async function handleUpload() {
    if (!file || !siteId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const prev = await assetsApi.uploadImport(file, siteId);
      setPreview(prev);

      // Async job → poll until PREVIEW_READY
      if (prev.status === "PROCESSING") {
        setPolling(true);
        pollUntilReady(prev.import_id);
      } else {
        initDecisions(prev);
        setStep(1);
      }
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function pollUntilReady(importId: string) {
    let attempts = 0;
    while (attempts < 60) {
      await sleep(2000);
      try {
        const prev = await assetsApi.getImportStatus(importId);
        if (prev.status === "PREVIEW_READY") {
          setPreview(prev);
          setPolling(false);
          initDecisions(prev);
          setStep(1);
          return;
        }
        if (prev.status === "FAILED") {
          setUploadError((prev.rows as any)?.[0]?.error ?? "Import processing failed.");
          setPolling(false);
          return;
        }
      } catch {}
      attempts++;
    }
    setUploadError("Timed out waiting for import to process.");
    setPolling(false);
  }

  function initDecisions(prev: ImportPreview) {
    const d: ActionMap = {};
    for (const row of prev.rows) {
      if (row.status === "NEW")              d[row.row_number] = "create";
      else if (row.status === "UPDATE_CANDIDATE") d[row.row_number] = "update";
      else                                        d[row.row_number] = "skip";
    }
    setDecisions(d);
  }

  // -------------------------------------------------------------------------
  // Step 2: Corrections
  // -------------------------------------------------------------------------

  function setCorrection(rowNum: number, field: string, value: string) {
    setCorrections((prev) => ({
      ...prev,
      [rowNum]: { ...(prev[rowNum] ?? {}), [field]: value },
    }));
  }

  async function applyCorrections() {
    if (!preview) return;
    const corrList: ImportCorrection[] = [];
    for (const [rowStr, fields] of Object.entries(corrections)) {
      const rowNum = Number(rowStr);
      for (const [field, new_value] of Object.entries(fields)) {
        if (new_value.trim()) corrList.push({ row_number: rowNum, field, new_value });
      }
    }
    try {
      const updated = await assetsApi.applyCorrections(preview.import_id, corrList);
      setPreview(updated);
      initDecisions(updated);
      setStep(3);
    } catch (e: any) {
      alert(e.message ?? "Failed to apply corrections.");
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Confirm
  // -------------------------------------------------------------------------

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const decList: ImportDecision[] = Object.entries(decisions).map(([row, action]) => ({
        row_number: Number(row),
        action,
      }));
      const res = await assetsApi.confirmImport(preview.import_id, decList);
      setResult(res);
      setStep(5);
    } catch (e: any) {
      setConfirmError(e.message ?? "Confirm failed.");
    } finally {
      setConfirming(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const rejectedRows  = preview?.rows.filter((r) => r.status === "REJECTED") ?? [];
  const hasRejected   = rejectedRows.length > 0;

  const actionableRows = preview?.rows.filter(
    (r) => r.status === "UPDATE_CANDIDATE" || r.status === "DUPLICATE"
  ) ?? [];

  const summaryNew     = preview?.rows.filter((r) => decisions[r.row_number] === "create").length ?? 0;
  const summaryUpdate  = preview?.rows.filter((r) => decisions[r.row_number] === "update").length ?? 0;
  const summarySkip    = preview?.rows.filter((r) => decisions[r.row_number] === "skip").length ?? 0;

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/assets")} style={backBtn}>← Asset Ledger</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Import Assets</h2>
      </div>

      <StepWizard steps={WIZARD_STEPS} currentStep={step}>
        {/* ===== STEP 0: UPLOAD ===== */}
        {step === 0 && (
          <div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Site *</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selectStyle}>
                <option value="">Select a site…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>File (CSV or XLSX, max 25 MB) *</label>
              <FileDropzone onFile={setFile} error={uploadError} />
              {file && (
                <div style={{ marginTop: "0.5rem", color: "#198754", fontSize: "0.88rem" }}>
                  ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            {uploadError && !file && (
              <div style={errorBox}>{uploadError}</div>
            )}

            {polling ? (
              <div style={{ color: "#6c757d", marginTop: "1rem" }}>
                ⏳ Processing large file… checking every 2 seconds…
              </div>
            ) : (
              <button
                onClick={handleUpload}
                disabled={!file || !siteId || uploading}
                style={primaryBtn}
              >
                {uploading ? "Uploading…" : "Upload & Preview"}
              </button>
            )}
          </div>
        )}

        {/* ===== STEP 1: PREVIEW ===== */}
        {step === 1 && preview && (
          <div>
            <SummaryBar preview={preview} />

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                    <th style={th}>#</th>
                    <th style={th}>Status</th>
                    <th style={th}>Asset Code</th>
                    <th style={th}>Name</th>
                    <th style={th}>Classification</th>
                    <th style={th}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <ImportRowDisplay key={row.row_number} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setStep(0)} style={outlineBtn}>← Back</button>
              {hasRejected ? (
                <button onClick={() => setStep(2)} style={primaryBtn}>
                  Fix {rejectedRows.length} Error{rejectedRows.length !== 1 ? "s" : ""} →
                </button>
              ) : (
                <button onClick={() => setStep(3)} style={primaryBtn}>
                  Continue to Decisions →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ===== STEP 2: CORRECTIONS ===== */}
        {step === 2 && preview && (
          <div>
            <p style={{ color: "#6c757d", marginBottom: "1rem" }}>
              Edit the fields below to fix validation errors, then click Re-validate.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                  <th style={th}>#</th>
                  <th style={th}>Asset Code</th>
                  <th style={th}>Name</th>
                  <th style={th}>Classification Code</th>
                  <th style={th}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {rejectedRows.map((row) => (
                  <tr key={row.row_number} style={{ borderBottom: "1px solid #dee2e6", background: "#fff8f8" }}>
                    <td style={td}>{row.row_number}</td>
                    <td style={td}>
                      <input
                        defaultValue={corrections[row.row_number]?.asset_code ?? row.asset_code}
                        onBlur={(e) => setCorrection(row.row_number, "asset_code", e.target.value)}
                        style={{ ...inlineInput, width: "120px" }}
                      />
                    </td>
                    <td style={td}>
                      <input
                        defaultValue={corrections[row.row_number]?.name ?? row.name}
                        onBlur={(e) => setCorrection(row.row_number, "name", e.target.value)}
                        style={{ ...inlineInput, width: "180px" }}
                      />
                    </td>
                    <td style={td}>
                      <input
                        defaultValue={corrections[row.row_number]?.classification_code ?? row.classification_code}
                        onBlur={(e) => setCorrection(row.row_number, "classification_code", e.target.value)}
                        style={{ ...inlineInput, width: "140px" }}
                      />
                    </td>
                    <td style={td}>
                      {row.errors.map((err, i) => (
                        <div key={i} style={{ color: "#dc3545", fontSize: "0.8rem" }}>{err}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setStep(1)} style={outlineBtn}>← Back to Preview</button>
              <button onClick={applyCorrections} style={primaryBtn}>Re-validate →</button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: DECISIONS ===== */}
        {step === 3 && preview && (
          <div>
            <p style={{ color: "#6c757d", marginBottom: "0.75rem" }}>
              Choose what to do with UPDATE and DUPLICATE rows. NEW rows will be created automatically.
            </p>

            {actionableRows.length === 0 ? (
              <p style={{ color: "#198754" }}>No conflicts — all rows are NEW. Ready to confirm.</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                  <button onClick={() => {
                    const d = { ...decisions };
                    for (const r of actionableRows) d[r.row_number] = "update";
                    setDecisions(d);
                  }} style={smallBtn}>Update All</button>
                  <button onClick={() => {
                    const d = { ...decisions };
                    for (const r of actionableRows) d[r.row_number] = "skip";
                    setDecisions(d);
                  }} style={smallBtn}>Skip All</button>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                      <th style={th}>#</th>
                      <th style={th}>Status</th>
                      <th style={th}>Asset Code</th>
                      <th style={th}>Name</th>
                      <th style={th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionableRows.map((row) => (
                      <tr key={row.row_number} style={{ borderBottom: "1px solid #dee2e6" }}>
                        <td style={td}>{row.row_number}</td>
                        <td style={td}><StatusBadge status={row.status} /></td>
                        <td style={td}><code>{row.asset_code}</code></td>
                        <td style={td}>{row.name}</td>
                        <td style={td}>
                          <label style={{ marginRight: "1rem", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`action-${row.row_number}`}
                              checked={decisions[row.row_number] === "update"}
                              onChange={() => setDecisions((d) => ({ ...d, [row.row_number]: "update" }))}
                              style={{ marginRight: "4px" }}
                            />
                            Update existing
                          </label>
                          <label style={{ cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`action-${row.row_number}`}
                              checked={decisions[row.row_number] === "skip"}
                              onChange={() => setDecisions((d) => ({ ...d, [row.row_number]: "skip" }))}
                              style={{ marginRight: "4px" }}
                            />
                            Skip
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setStep(hasRejected ? 2 : 1)} style={outlineBtn}>← Back</button>
              <button onClick={() => setStep(4)} style={primaryBtn}>Review Summary →</button>
            </div>
          </div>
        )}

        {/* ===== STEP 4: CONFIRM ===== */}
        {step === 4 && preview && (
          <div>
            <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>Import Summary</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                <SumCard label="New assets" count={summaryNew}    color="#198754" />
                <SumCard label="Updates"    count={summaryUpdate} color="#0d6efd" />
                <SumCard label="Skipped"    count={summarySkip}   color="#6c757d" />
              </div>
            </div>

            {confirmError && <div style={{ ...errorBox, marginBottom: "1rem" }}>{confirmError}</div>}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setStep(3)} style={outlineBtn} disabled={confirming}>← Back</button>
              <button onClick={handleConfirm} disabled={confirming} style={primaryBtn}>
                {confirming ? "⏳ Confirming…" : "✓ Confirm Import"}
              </button>
            </div>
          </div>
        )}

        {/* ===== STEP 5: RESULTS ===== */}
        {step === 5 && result && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>✅</div>
            <h3 style={{ margin: "0 0 0.5rem", fontWeight: 700 }}>Import Complete</h3>
            <div style={{ color: "#6c757d", marginBottom: "1.5rem" }}>
              {result.created} created · {result.updated} updated · {result.skipped} skipped
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button onClick={() => navigate("/assets")} style={primaryBtn}>View Assets</button>
              <button onClick={() => {
                setStep(0); setFile(null); setSiteId(""); setPreview(null);
                setCorrections({}); setDecisions({}); setResult(null);
              }} style={outlineBtn}>
                Import Another
              </button>
            </div>
          </div>
        )}
      </StepWizard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryBar({ preview }: { preview: ImportPreview }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      {[
        { label: "NEW",           count: preview.new_count,             color: "#198754" },
        { label: "UPDATE",        count: preview.update_count,          color: "#0d6efd" },
        { label: "DUPLICATE",     count: preview.duplicate_count,       color: "#856404" },
        { label: "ERRORS",        count: preview.rejected_count,        color: "#dc3545" },
        { label: "BATCH DUP",     count: preview.batch_duplicate_count, color: "#7d2d00" },
        { label: "TOTAL",         count: preview.total,                  color: "#212529" },
      ].map(({ label, count, color }) => (
        <div key={label} style={{ padding: "6px 14px", background: "#f8f9fa", borderRadius: "6px", fontSize: "0.85rem" }}>
          <span style={{ fontWeight: 700, color }}>{count}</span>
          <span style={{ color: "#6c757d", marginLeft: "4px" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { bg: "#eee", color: "#333" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, background: style.bg, color: style.color, whiteSpace: "nowrap" }}>
      {status.replace("_", " ")}
    </span>
  );
}

function ImportRowDisplay({ row }: { row: ImportRow }) {
  return (
    <>
      <tr style={{ borderBottom: row.errors.length ? "none" : "1px solid #dee2e6" }}>
        <td style={td}>{row.row_number}</td>
        <td style={td}><StatusBadge status={row.status} /></td>
        <td style={td}><code>{row.asset_code || "—"}</code></td>
        <td style={td}>{row.name || "—"}</td>
        <td style={td}>{row.classification_code || "—"}</td>
        <td style={td}>{row.errors.length > 0 ? `${row.errors.length} error(s)` : ""}</td>
      </tr>
      {row.errors.length > 0 && (
        <tr style={{ borderBottom: "1px solid #dee2e6", background: "#fff8f8" }}>
          <td colSpan={6} style={{ padding: "4px 12px 8px 32px" }}>
            {row.errors.map((err, i) => (
              <div key={i} style={{ color: "#dc3545", fontSize: "0.82rem" }}>• {err}</div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function SumCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ textAlign: "center", background: "#fff", borderRadius: "8px", padding: "1rem", border: "1px solid #dee2e6" }}>
      <div style={{ fontSize: "2rem", fontWeight: 700, color }}>{count}</div>
      <div style={{ color: "#6c757d", fontSize: "0.85rem" }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const backBtn: React.CSSProperties  = { background: "none", border: "none", color: "#0d6efd", cursor: "pointer", fontSize: "0.9rem", padding: 0 };
const primaryBtn: React.CSSProperties = { padding: "8px 20px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const outlineBtn: React.CSSProperties = { padding: "8px 16px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontWeight: 500 };
const smallBtn: React.CSSProperties   = { padding: "5px 12px", background: "#fff", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, fontSize: "0.88rem", color: "#212529", marginBottom: "4px" };
const selectStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", minWidth: "220px" };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px" };
const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 600, fontSize: "0.8rem", color: "#495057", textTransform: "uppercase", textAlign: "left" };
const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };
const inlineInput: React.CSSProperties = { padding: "4px 8px", border: "1px solid #ced4da", borderRadius: "4px", fontSize: "0.85rem" };
