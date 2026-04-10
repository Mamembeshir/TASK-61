import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function PendingPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⏳</div>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 700, color: "#1a1a2e" }}>
          Account Under Review
        </h2>
        <p style={{ margin: "0 0 1.5rem", color: "#6c757d", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Your account is currently being reviewed by an administrator.
          You'll be notified once your account is approved.
        </p>
        <button onClick={handleLogout} style={btn}>
          Sign out
        </button>
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
  padding: "2.5rem 2.25rem",
  maxWidth: "400px",
  width: "100%",
  textAlign: "center",
};

const btn: React.CSSProperties = {
  padding: "9px 24px",
  background: "#6c757d",
  color: "#fff",
  border: "none",
  borderRadius: "7px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};
