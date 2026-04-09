import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.non_field_errors?.[0] ?? err.message ?? "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem", fontWeight: 700 }}>HarborOps</h1>
        <p style={{ margin: "0 0 1.75rem", color: "#6c757d", fontSize: "0.9rem" }}>Sign in to your account</p>

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={input}
              placeholder="username"
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ margin: "1.25rem 0 0", fontSize: "0.85rem", color: "#6c757d", textAlign: "center" }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ color: "#0d6efd", textDecoration: "none" }}>Register</Link>
        </p>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8f9fa",
  fontFamily: "system-ui, sans-serif",
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
  padding: "2rem 2.25rem",
  width: "100%",
  maxWidth: "380px",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: "#495057",
  marginBottom: "6px",
};
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #ced4da",
  borderRadius: "7px",
  fontSize: "0.95rem",
  boxSizing: "border-box",
  outline: "none",
};
const submitBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px",
  background: "#0d6efd",
  color: "#fff",
  border: "none",
  borderRadius: "7px",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const errorBox: React.CSSProperties = {
  background: "#f8d7da",
  color: "#842029",
  padding: "10px 14px",
  borderRadius: "7px",
  marginBottom: "1rem",
  fontSize: "0.88rem",
};
