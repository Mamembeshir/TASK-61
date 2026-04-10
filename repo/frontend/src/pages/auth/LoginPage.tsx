import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Shield, Eye, EyeOff } from "lucide-react";
import { colors, radius, font, transition } from "@/styles/tokens";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [showPw,   setShowPw]     = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [focusedField, setFocused] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.status === "PENDING_REVIEW")  navigate("/pending",      { replace: true });
      else if (user.status === "SUSPENDED")  navigate("/suspended",    { replace: true });
      else if (user.role === "ADMIN")        navigate("/admin/users",  { replace: true });
      else if (user.role === "COURIER")      navigate("/courier",      { replace: true });
      else                                   navigate("/dashboard",    { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.detail ??
        err.response?.data?.non_field_errors?.[0] ??
        err.message ??
        "Invalid credentials. Please try again."
      );
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

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: colors.bg,
    }}>
      {/* Left panel — branding */}
      <div style={{
        display: "none",
        flex: "0 0 420px",
        background: colors.sidebarBg,
        flexDirection: "column",
        justifyContent: "center",
        padding: "3rem",
        position: "relative",
        overflow: "hidden",
      }}
        className="auth-panel"
      >
        {/* Background decoration */}
        <div style={{
          position: "absolute",
          top: "-80px", right: "-80px",
          width: 320, height: 320,
          borderRadius: "50%",
          background: "rgba(99,102,241,0.12)",
        }} />
        <div style={{
          position: "absolute",
          bottom: "-60px", left: "-60px",
          width: 240, height: 240,
          borderRadius: "50%",
          background: "rgba(99,102,241,0.08)",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "3rem" }}>
            <div style={{
              width: 40, height: 40, borderRadius: radius.md,
              background: colors.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={20} color="#fff" />
            </div>
            <span style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: "#fff" }}>
              HarborOps
            </span>
          </div>

          <h2 style={{
            fontSize: "2rem",
            fontWeight: font.weight.bold,
            color: "#fff",
            lineHeight: 1.3,
            marginBottom: "1rem",
          }}>
            Operations made simple
          </h2>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: font.size.base, lineHeight: 1.7 }}>
            Manage assets, menus, meetings, and couriers — all from one unified dashboard.
          </p>

          <div style={{ marginTop: "3rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              "Role-based access control",
              "Real-time alerts & webhooks",
              "Versioned menus & recipes",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: colors.primary, flexShrink: 0,
                }} />
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: font.size.sm }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}>
        <div style={{
          width: "100%",
          maxWidth: 400,
        }}>
          {/* Mobile brand mark */}
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

          <h1 style={{
            margin: "0 0 0.35rem",
            fontSize: font.size.h2,
            fontWeight: font.weight.bold,
            color: colors.text,
            letterSpacing: "-0.02em",
          }}>
            Welcome back
          </h1>
          <p style={{ margin: "0 0 2rem", fontSize: font.size.base, color: colors.textMuted }}>
            Sign in to continue to your workspace
          </p>

          {/* Error banner */}
          {error && (
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              padding: "12px 14px",
              background: colors.dangerLight,
              color: colors.dangerDark,
              borderRadius: radius.md,
              border: `1px solid ${colors.danger}30`,
              marginBottom: "1.25rem",
              fontSize: font.size.sm,
              lineHeight: 1.5,
            }}>
              <span style={{ flexShrink: 0, marginTop: "1px" }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Username */}
            <div>
              <label style={{
                display: "block",
                fontSize: font.size.sm,
                fontWeight: font.weight.medium,
                color: colors.textSecondary,
                marginBottom: "6px",
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={() => setFocused("username")}
                onBlur={() => setFocused(null)}
                style={inputStyle("username")}
                placeholder="Enter your username"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: "block",
                fontSize: font.size.sm,
                fontWeight: font.weight.medium,
                color: colors.textSecondary,
                marginBottom: "6px",
              }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  style={{ ...inputStyle("password"), paddingRight: "42px" }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  style={{
                    position: "absolute",
                    right: 12, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: colors.textMuted,
                    cursor: "pointer",
                    display: "flex",
                    padding: 0,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
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
                marginTop: "0.25rem",
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = colors.primaryHover; }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = colors.primary; }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p style={{
            marginTop: "1.75rem",
            fontSize: font.size.sm,
            color: colors.textMuted,
            textAlign: "center",
          }}>
            Don't have an account?{" "}
            <Link to="/register" style={{ color: colors.primary, fontWeight: font.weight.medium }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
