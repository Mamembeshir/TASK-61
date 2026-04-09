import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { assetsApi, type Classification, type Site, type AssetDetail } from "@/api/assets";
import TreeSelect from "@/components/TreeSelect";
import ConfirmDialog from "@/components/ConfirmDialog";

const CODE_RE = /^[A-Z0-9\-]{3,50}$/;

interface CustomField { key: string; value: string }

export default function AssetCreatePage() {
  const navigate = useNavigate();

  const [code,    setCode]    = useState("");
  const [name,    setName]    = useState("");
  const [siteId,  setSiteId]  = useState("");
  const [clsId,   setClsId]   = useState("");
  const [fields,  setFields]  = useState<CustomField[]>([{ key: "", value: "" }]);

  const [sites,           setSites]           = useState<Site[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);

  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [conflict,  setConflict]  = useState<AssetDetail | null>(null);

  useEffect(() => {
    assetsApi.listSites().then(setSites).catch(() => {});
    assetsApi.listClassifications().then(setClassifications).catch(() => {});
  }, []);

  // Live validation
  const codeError = code && !CODE_RE.test(code)
    ? "Must be 3–50 uppercase letters, digits, or hyphens."
    : "";

  function addField() {
    setFields((f) => [...f, { key: "", value: "" }]);
  }

  function removeField(idx: number) {
    setFields((f) => f.filter((_, i) => i !== idx));
  }

  function updateField(idx: number, part: "key" | "value", val: string) {
    setFields((f) => f.map((field, i) => i === idx ? { ...field, [part]: val } : field));
  }

  function buildCustomData(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { key, value } of fields) {
      if (key.trim()) out[key.trim()] = value;
    }
    return out;
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!code)           errs.code    = "Asset code is required.";
    else if (codeError)  errs.code    = codeError;
    if (!name.trim())    errs.name    = "Name is required.";
    if (!siteId)         errs.site    = "Site is required.";
    if (!clsId)          errs.cls     = "Classification is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const asset = await assetsApi.createAsset({
        asset_code:        code,
        name:              name.trim(),
        site_id:           siteId,
        classification_id: clsId,
        custom_data:       buildCustomData(),
      });
      navigate(`/assets/${asset.id}`);
    } catch (e: any) {
      if (e.status === 409 || e.response?.status === 409) {
        // Duplicate fingerprint — show conflict modal
        const existing: AssetDetail = e.response?.data?.existing_id
          ? { id: e.response.data.existing_id, name: e.response.data.existing_name } as AssetDetail
          : null as any;
        setConflict(existing);
      } else {
        const fieldErrs: Record<string, string> = {};
        const detail = e.response?.data ?? e;
        if (typeof detail === "object") {
          for (const [k, v] of Object.entries(detail)) {
            fieldErrs[k] = Array.isArray(v) ? v[0] : String(v);
          }
        }
        if (Object.keys(fieldErrs).length) {
          setErrors(fieldErrs);
        } else {
          setErrors({ _general: e.message ?? "Failed to create asset." });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "640px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/assets")} style={backBtn}>← Back</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>New Asset</h2>
      </div>

      {errors._general && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
          {errors._general}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Asset Code */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Asset Code *</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. PUMP-001"
            style={{ ...inputStyle, borderColor: (errors.code || codeError) ? "#dc3545" : "#ced4da" }}
          />
          {(errors.code || codeError) && <span style={errMsg}>{errors.code || codeError}</span>}
          <span style={{ fontSize: "0.78rem", color: "#6c757d" }}>3–50 chars, uppercase A–Z, 0–9, hyphens only</span>
        </div>

        {/* Name */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Centrifugal Pump #3"
            style={{ ...inputStyle, borderColor: errors.name ? "#dc3545" : "#ced4da" }}
          />
          {errors.name && <span style={errMsg}>{errors.name}</span>}
        </div>

        {/* Site */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Site *</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{ ...inputStyle, borderColor: errors.site ? "#dc3545" : "#ced4da" }}
          >
            <option value="">Select a site…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {errors.site && <span style={errMsg}>{errors.site}</span>}
        </div>

        {/* Classification */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Classification *</label>
          <TreeSelect
            classifications={classifications}
            value={clsId}
            onChange={setClsId}
            placeholder="Select classification…"
            style={{ ...inputStyle, borderColor: errors.cls ? "#dc3545" : "#ced4da" }}
          />
          {errors.cls && <span style={errMsg}>{errors.cls}</span>}
        </div>

        {/* Custom fields */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Custom Fields</label>
          {fields.map((f, idx) => (
            <div key={idx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                value={f.key}
                onChange={(e) => updateField(idx, "key", e.target.value)}
                placeholder="Field name"
                style={{ ...inputStyle, flex: "1" }}
              />
              <input
                value={f.value}
                onChange={(e) => updateField(idx, "value", e.target.value)}
                placeholder="Value"
                style={{ ...inputStyle, flex: "2" }}
              />
              <button type="button" onClick={() => removeField(idx)} style={removeBtn}>×</button>
            </div>
          ))}
          <button type="button" onClick={addField} style={addFieldBtn}>+ Add field</button>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={() => navigate("/assets")} style={cancelBtn}>Cancel</button>
          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? "Creating…" : "Create Asset"}
          </button>
        </div>
      </form>

      {/* Duplicate conflict dialog */}
      {conflict !== null && (
        <ConfirmDialog
          title="Similar asset exists"
          message={
            <span>
              An asset with the same fingerprint already exists:
              {conflict?.id && (
                <strong> {(conflict as any).asset_code ?? conflict.id} — {conflict.name}</strong>
              )}
              <br /><br />
              Would you like to view the existing asset instead?
            </span>
          }
          confirmLabel="View existing"
          cancelLabel="Stay here"
          onConfirm={() => { if (conflict?.id) navigate(`/assets/${conflict.id}`); }}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const fieldGroup: React.CSSProperties = {
  marginBottom: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.88rem",
  color: "#212529",
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  fontSize: "0.9rem",
  width: "100%",
  boxSizing: "border-box",
};

const errMsg: React.CSSProperties = {
  color: "#dc3545",
  fontSize: "0.82rem",
};

const backBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0d6efd",
  cursor: "pointer",
  fontSize: "0.9rem",
  padding: 0,
};

const removeBtn: React.CSSProperties = {
  padding: "4px 10px",
  background: "#f8d7da",
  color: "#842029",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 700,
};

const addFieldBtn: React.CSSProperties = {
  padding: "5px 12px",
  background: "none",
  border: "1px dashed #ced4da",
  borderRadius: "6px",
  cursor: "pointer",
  color: "#6c757d",
  fontSize: "0.85rem",
  marginTop: "2px",
};

const cancelBtn: React.CSSProperties = {
  padding: "9px 20px",
  background: "#fff",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
};

const submitBtn: React.CSSProperties = {
  padding: "9px 24px",
  background: "#0d6efd",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};
