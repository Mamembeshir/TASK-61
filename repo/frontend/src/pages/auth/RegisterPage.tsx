import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "@/api/auth";
import { Shield, Upload, X } from "lucide-react";
import { colors, radius, font, transition } from "@/styles/tokens";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    password: "",
    legalFirstName: "",
    legalLastName: "",
    employeeStudentId: "",
    tenantSlug: "",
    governmentId: "",
  });
  const [photoId,  setPhotoId]  = useState<File | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [focusedField, setFocused] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoId(file);
  }

  function clearFile() {
    setPhotoId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register({
        ...form,
        photoId:      photoId ?? undefined,
        governmentId: form.governmentId || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      const data = err.response?.data as Record<string, any> | undefined;
      const firstFieldError = data ? Object.values(data)[0] : undefined;
      const msg =
        data?.detail ??
        data?.username?.[0] ??
        data?.password?.[0] ??
        (Array.isArray(firstFieldError) ? firstFieldError[0] : undefined) ??
        err.message ??
        "Registration failed. Please check your details.";
      setError(typeof msg === "string" ? msg : String(msg));
    } finally {
      setLoading(false);
    }
  }

  function inputStyle(field: string): React.CSSProperties {
    const focused = focusedField === field;
    return {
      display: "block",
      width: "100%",
      padding: "10px 14px",
      border: `1.5px solid ${focused ? colors.primary : colors.border}`,
      borderRadius: radius.md,
      fontSize: font.size.base,
      color: colors.text,
      background: colors.surface,
      outline: "none",
      boxSizing: "border-box" as const,
      transition: `border-color ${transition.base}`,
      boxShadow: focused ? `0 0 0 3px rgba(99,102,241,0.12)` : "none",
    };
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.textSecondary,
    marginBottom: "6px",
  };

  if (success) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.bg,
        padding: "2rem",
      }}>
        <div style={{
          background: colors.surface,
          borderRadius: radius.xl,
          padding: "3rem 2.5rem",
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: font.size.h2, fontWeight: font.weight.bold, color: colors.text }}>
            Registration submitted!
          </h2>
          <p style={{ color: colors.textMuted, fontSize: font.size.base, lineHeight: 1.6 }}>
            Your account is pending admin review. You'll be notified once it's approved.
          </p>
          <button
            onClick={() => navigate("/login")}
            style={{
              marginTop: "2rem",
              padding: "10px 24px",
              background: colors.primary,
              color: "#fff",
              border: "none",
              borderRadius: radius.md,
              fontSize: font.size.base,
              fontWeight: font.weight.semibold,
              cursor: "pointer",
            }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  const textFields: { key: keyof typeof form; label: string; type?: string; placeholder: string; required?: boolean }[] = [
    { key: "legalFirstName",    label: "First name",              placeholder: "Jane",        required: true  },
    { key: "legalLastName",     label: "Last name",               placeholder: "Smith",       required: true  },
    { key: "username",          label: "Username",                placeholder: "janesmith",   required: true  },
    { key: "password",          label: "Password",                placeholder: "••••••••",    type: "password", required: true },
    { key: "employeeStudentId", label: "Employee / Student ID",   placeholder: "EMP-1234",    required: true  },
    { key: "tenantSlug",        label: "Organisation code",       placeholder: "harbor-ops",  required: true  },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: colors.bg,
      padding: "2rem",
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2.5rem" }}>
          <div style={{
            width: 36, height: 36, borderRadius: radius.md,
            background: colors.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={18} color="#fff" />
          </div>
          <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text }}>
            HarborOps
          </span>
        </div>

        <h1 style={{ margin: "0 0 0.35rem", fontSize: font.size.h2, fontWeight: font.weight.bold, color: colors.text, letterSpacing: "-0.02em" }}>
          Create your account
        </h1>
        <p style={{ margin: "0 0 2rem", fontSize: font.size.base, color: colors.textMuted }}>
          Fill in your details to request access
        </p>

        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "0.625rem",
            padding: "12px 14px",
            background: colors.dangerLight, color: colors.dangerDark,
            borderRadius: radius.md, border: `1px solid ${colors.danger}30`,
            marginBottom: "1.25rem", fontSize: font.size.sm, lineHeight: 1.5,
          }}>
            <span style={{ flexShrink: 0, marginTop: "1px" }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Two-column name row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {textFields.slice(0, 2).map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  type={f.type ?? "text"}
                  value={form[f.key]}
                  onChange={set(f.key)}
                  onFocus={() => setFocused(f.key)}
                  onBlur={() => setFocused(null)}
                  style={inputStyle(f.key)}
                  placeholder={f.placeholder}
                  required={f.required}
                />
              </div>
            ))}
          </div>

          {/* Remaining text fields */}
          {textFields.slice(2).map(f => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              <input
                type={f.type ?? "text"}
                value={form[f.key]}
                onChange={set(f.key)}
                onFocus={() => setFocused(f.key)}
                onBlur={() => setFocused(null)}
                style={inputStyle(f.key)}
                placeholder={f.placeholder}
                required={f.required}
                autoComplete={f.key === "password" ? "new-password" : "off"}
              />
            </div>
          ))}

          {/* Government ID (optional) */}
          <div>
            <label style={labelStyle}>
              Government ID{" "}
              <span style={{ color: colors.textMuted, fontWeight: font.weight.normal }}>(optional)</span>
            </label>
            <input
              type="text"
              value={form.governmentId}
              onChange={set("governmentId")}
              onFocus={() => setFocused("governmentId")}
              onBlur={() => setFocused(null)}
              style={inputStyle("governmentId")}
              placeholder="Passport, national ID, or driver's licence number"
              autoComplete="off"
            />
          </div>

          {/* Photo ID upload (optional) */}
          <div>
            <label style={labelStyle}>
              Photo ID{" "}
              <span style={{ color: colors.textMuted, fontWeight: font.weight.normal }}>(optional — JPEG, PNG, or PDF, max 10 MB)</span>
            </label>
            {photoId ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px",
                border: `1.5px solid ${colors.primary}`,
                borderRadius: radius.md,
                background: colors.primaryLight + "22",
                fontSize: font.size.sm,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: colors.text, minWidth: 0 }}>
                  <Upload size={14} color={colors.primary} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {photoId.name}
                  </span>
                  <span style={{ color: colors.textMuted, flexShrink: 0 }}>
                    ({(photoId.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 0, display: "flex", flexShrink: 0 }}
                  title="Remove file"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  width: "100%", padding: "10px 14px",
                  border: `1.5px dashed ${colors.border}`,
                  borderRadius: radius.md,
                  background: colors.surface,
                  color: colors.textMuted,
                  fontSize: font.size.sm,
                  cursor: "pointer",
                  boxSizing: "border-box",
                  transition: `border-color ${transition.base}, color ${transition.base}`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = colors.primary; (e.currentTarget as HTMLElement).style.color = colors.primary; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.textMuted; }}
              >
                <Upload size={15} />
                Click to upload photo ID
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px",
              background: loading ? colors.gray400 : colors.primary,
              color: "#fff",
              border: "none",
              borderRadius: radius.md,
              fontSize: font.size.base,
              fontWeight: font.weight.semibold,
              cursor: loading ? "not-allowed" : "pointer",
              transition: `background ${transition.base}`,
              marginTop: "0.5rem",
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = colors.primaryHover; }}
            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = colors.primary; }}
          >
            {loading ? "Submitting…" : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: "1.75rem", fontSize: font.size.sm, color: colors.textMuted, textAlign: "center" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: colors.primary, fontWeight: font.weight.medium }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
