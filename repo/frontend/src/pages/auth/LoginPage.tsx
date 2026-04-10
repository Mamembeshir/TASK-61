import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Shield, Eye, EyeOff } from "lucide-react";
import { colors, radius, font, transition, gradients } from "@/styles/tokens";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [tenantSlug,  setTenantSlug]  = useState("");
  const [showSlug,    setShowSlug]    = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [focusedField, setFocused]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, password, tenantSlug || undefined);
      if (user.status === "PENDING_REVIEW")  navigate("/pending",      { replace: true });
      else if (user.status === "SUSPENDED")  navigate("/suspended",    { replace: true });
      else if (user.role === "ADMIN")        navigate("/admin/users",  { replace: true });
      else if (user.role === "COURIER")      navigate("/courier",      { replace: true });
      else                                   navigate("/dashboard",    { replace: true });
    } catch (err: any) {
      const detail: string =
        err.response?.data?.detail ??
        err.response?.data?.non_field_errors?.[0] ??
        err.message ??
        "Invalid credentials. Please try again.";

      // Auto-reveal organisation code field when the backend signals a collision
      if (detail.includes("Multiple accounts")) {
        setShowSlug(true);
        setError("Multiple accounts share that username. Please enter your organisation code below.");
      } else {
        setError(detail);
      }
    } finally {
      setLoading(false);
    }
  }

  function inputStyle(field: string): React.CSSProperties {
    const focused = focusedField === field;
    return {
      display: "block",
      width: "100%",
      padding: "11px 14px",
      border: `1.5px solid ${focused ? colors.primary : colors.border}`,
      borderRadius: radius.md,
      fontSize: font.size.base,
      color: colors.text,
      background: colors.surface,
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: font.family,
      lineHeight: 1.5,
      transition: `border-color ${transition.base}, box-shadow ${transition.base}, background ${transition.base}`,
      boxShadow: focused
        ? `0 0 0 4px rgba(79,70,229,0.14), 0 1px 2px rgba(15,23,42,0.04)`
        : `0 1px 2px rgba(15,23,42,0.04)`,
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
        flex: "0 0 460px",
        background: gradients.heroMesh,
        flexDirection: "column",
        justifyContent: "center",
        padding: "3.5rem",
        position: "relative",
        overflow: "hidden",
      }}
        className="auth-panel"
      >
        {/* Background decoration — large soft glow blobs */}
        <div style={{
          position: "absolute",
          top: "-140px", right: "-120px",
          width: 380, height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)",
          filter: "blur(6px)",
        }} />
        <div style={{
          position: "absolute",
          bottom: "-120px", left: "-100px",
          width: 320, height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)",
          filter: "blur(6px)",
        }} />
        {/* Subtle dotted grid overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)`,
          backgroundSize: "22px 22px",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "3rem" }}>
            <div style={{
              width: 44, height: 44, borderRadius: radius.lg,
              background: gradients.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 20px -4px rgba(79,70,229,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}>
              <Shield size={22} color="#fff" />
            </div>
            <span style={{
              fontSize: font.size.xxl,
              fontWeight: font.weight.bold,
              color: "#fff",
              letterSpacing: font.tracking.tight,
            }}>
              HarborOps
            </span>
          </div>

          <h2 style={{
            fontSize: "2.25rem",
            fontWeight: font.weight.bold,
            color: "#fff",
            lineHeight: 1.2,
            marginBottom: "1.1rem",
            letterSpacing: font.tracking.tighter,
          }}>
            Operations,<br/>elegantly unified.
          </h2>
          <p style={{
            color: "rgba(226,232,240,0.7)",
            fontSize: font.size.md,
            lineHeight: 1.7,
            maxWidth: 360,
          }}>
            Assets, kitchens, meetings, and couriers — one calm, modern workspace for teams that take their craft seriously.
          </p>

          <div style={{ marginTop: "3rem", display: "flex", flexDirection: "column", gap: "0.95rem" }}>
            {[
              "Role-based access & audit trail",
              "Real-time alerts & webhooks",
              "Versioned menus & recipes",
              "Multi-tenant by design",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "rgba(129,140,248,0.18)",
                  border: "1px solid rgba(129,140,248,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "#A5B4FC",
                  }} />
                </div>
                <span style={{
                  color: "rgba(226,232,240,0.78)",
                  fontSize: font.size.sm,
                  fontWeight: font.weight.medium,
                }}>
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
        position: "relative",
      }}>
        <div style={{
          width: "100%",
          maxWidth: 408,
        }}>
          {/* Mobile brand mark — hidden on desktop where left panel shows brand */}
          <div className="auth-mobile-brand" style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2.5rem" }}>
            <div style={{
              width: 38, height: 38, borderRadius: radius.md,
              background: gradients.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 16px -4px rgba(79,70,229,0.45)",
            }}>
              <Shield size={18} color="#fff" />
            </div>
            <span style={{
              fontSize: font.size.xl,
              fontWeight: font.weight.bold,
              color: colors.text,
              letterSpacing: font.tracking.tight,
            }}>
              HarborOps
            </span>
          </div>

          <h1 style={{
            margin: "0 0 0.5rem",
            fontSize: font.size.h1,
            fontWeight: font.weight.bold,
            color: colors.text,
            letterSpacing: font.tracking.tighter,
            lineHeight: 1.15,
          }}>
            Welcome back
          </h1>
          <p style={{
            margin: "0 0 2.25rem",
            fontSize: font.size.md,
            color: colors.textSecondary,
            lineHeight: 1.5,
          }}>
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
              {!showSlug && (
                <button
                  type="button"
                  onClick={() => setShowSlug(true)}
                  style={{
                    marginTop: "6px",
                    background: "none", border: "none", padding: 0,
                    color: colors.textMuted, fontSize: font.size.xs,
                    cursor: "pointer", textDecoration: "underline",
                  }}
                >
                  Have multiple accounts? Add organisation code
                </button>
              )}
            </div>

            {/* Organisation code (revealed on demand or on collision) */}
            {showSlug && (
              <div>
                <label style={{
                  display: "block",
                  fontSize: font.size.sm,
                  fontWeight: font.weight.medium,
                  color: colors.textSecondary,
                  marginBottom: "6px",
                }}>
                  Organisation code
                  <span style={{ color: colors.textMuted, fontWeight: font.weight.normal }}> (optional)</span>
                </label>
                <input
                  type="text"
                  value={tenantSlug}
                  onChange={e => setTenantSlug(e.target.value)}
                  onFocus={() => setFocused("tenantSlug")}
                  onBlur={() => setFocused(null)}
                  style={inputStyle("tenantSlug")}
                  placeholder="e.g. coastal-university"
                  autoComplete="off"
                  autoFocus
                />
                <div style={{ marginTop: "5px", fontSize: font.size.xs, color: colors.textMuted }}>
                  Required when the same username exists across multiple organisations.
                </div>
              </div>
            )}

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
                padding: "12px",
                background: loading ? colors.gray400 : gradients.primary,
                color: "#fff",
                border: "none",
                borderRadius: radius.md,
                fontSize: font.size.md,
                fontWeight: font.weight.semibold,
                letterSpacing: "0.005em",
                cursor: loading ? "not-allowed" : "pointer",
                transition: `all ${transition.base}`,
                marginTop: "0.5rem",
                boxShadow: loading ? "none" : "0 4px 14px -4px rgba(79,70,229,0.45), 0 1px 3px rgba(15,23,42,0.1)",
              }}
              onMouseEnter={e => {
                if (!loading) {
                  (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px -4px rgba(79,70,229,0.55), 0 2px 4px rgba(15,23,42,0.1)";
                }
              }}
              onMouseLeave={e => {
                if (!loading) {
                  (e.currentTarget as HTMLElement).style.background = gradients.primary;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px -4px rgba(79,70,229,0.45), 0 1px 3px rgba(15,23,42,0.1)";
                }
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p style={{
            marginTop: "2rem",
            fontSize: font.size.sm,
            color: colors.textMuted,
            textAlign: "center",
          }}>
            Don't have an account?{" "}
            <Link to="/register" style={{
              color: colors.primary,
              fontWeight: font.weight.semibold,
              textDecoration: "none",
              borderBottom: `1px solid ${colors.primaryMid}`,
              paddingBottom: 1,
            }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
