import React from "react";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const confirmBg = confirmVariant === "danger" ? "#dc3545" : "#0d6efd";

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem", fontWeight: 700 }}>
          {title}
        </h3>
        <div style={{ color: "#495057", marginBottom: "1.25rem", lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={cancelBtn}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{ ...actionBtn, background: confirmBg }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000,
};

const box: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  padding: "1.5rem",
  minWidth: "340px",
  maxWidth: "480px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 18px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 500,
};

const actionBtn: React.CSSProperties = {
  padding: "8px 18px",
  border: "none",
  borderRadius: "6px",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
