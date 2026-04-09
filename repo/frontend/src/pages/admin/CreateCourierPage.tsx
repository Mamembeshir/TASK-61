import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, type Site } from "@/api/admin";

export default function CreateCourierPage() {
  const navigate = useNavigate();

  const [sites,   setSites]   = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [form, setForm] = useState({
    username:           "",
    password:           "",
    legal_first_name:   "",
    legal_last_name:    "",
    employee_student_id: "",
  });
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  useEffect(() => {
    adminApi.listSites().then(setSites).catch(() => {});
  }, []);

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleSite(id: string) {
    setSelectedSites(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await adminApi.createCourier({ ...form, site_ids: selectedSites });
      navigate(`/admin/users/${user.id}`);
    } catch (e: any) {
      const detail = e.response?.data?.detail ?? e.response?.data?.username?.[0] ?? e.message ?? "Failed to create courier.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "520px" }}>
      <button
        onClick={() => navigate("/admin/users")}
        style={outlineBtn}
      >
        ← Back to Users
      </button>

      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "1.25rem 0 1rem" }}>Create Courier Account</h2>

      {error && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <FormField label="Username" required>
          <input
            value={form.username}
            onChange={e => set("username", e.target.value)}
            required
            style={input}
          />
        </FormField>

        <FormField label="Password" required>
          <input
            type="password"
            value={form.password}
            onChange={e => set("password", e.target.value)}
            required
            style={input}
          />
        </FormField>

        <FormField label="Legal First Name" required>
          <input
            value={form.legal_first_name}
            onChange={e => set("legal_first_name", e.target.value)}
            required
            style={input}
          />
        </FormField>

        <FormField label="Legal Last Name" required>
          <input
            value={form.legal_last_name}
            onChange={e => set("legal_last_name", e.target.value)}
            required
            style={input}
          />
        </FormField>

        <FormField label="Employee / Student ID" required>
          <input
            value={form.employee_student_id}
            onChange={e => set("employee_student_id", e.target.value)}
            required
            style={input}
          />
        </FormField>

        <FormField label="Sites">
          {sites.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "#6c757d", margin: 0 }}>Loading sites…</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {sites.map(s => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedSites.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </FormField>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          <button type="submit" disabled={loading} style={solidBtn}>
            {loading ? "Creating…" : "Create Courier"}
          </button>
          <button type="button" onClick={() => navigate("/admin/users")} style={outlineBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px", color: "#495057" }}>
        {label}{required && <span style={{ color: "#dc3545", marginLeft: "2px" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  fontSize: "0.9rem",
  boxSizing: "border-box",
};

const solidBtn: React.CSSProperties = {
  padding: "8px 18px",
  background: "#0d6efd",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const outlineBtn: React.CSSProperties = {
  padding: "7px 16px",
  background: "#fff",
  color: "#495057",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "0.85rem",
};
