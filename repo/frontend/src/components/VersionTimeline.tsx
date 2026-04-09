import { useState } from "react";
import type { AssetVersion } from "@/api/assets";
import FieldDiff from "./FieldDiff";

interface Props {
  versions: AssetVersion[];   // newest first
}

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  MANUAL:      { bg: "#cfe2ff", color: "#084298" },
  BULK_IMPORT: { bg: "#d1e7dd", color: "#0a3622" },
  CORRECTION:  { bg: "#fff3cd", color: "#856404" },
};

export default function VersionTimeline({ versions }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (versions.length === 0) {
    return <p style={{ color: "#6c757d" }}>No version history.</p>;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={{ position: "relative", paddingLeft: "2rem" }}>
      {/* vertical line */}
      <div style={{
        position: "absolute", left: "7px", top: "8px", bottom: "8px",
        width: "2px", background: "#dee2e6",
      }} />

      {versions.map((v, idx) => {
        const prevVersion = versions[idx + 1];   // older version (since sorted newest-first)
        const col = SOURCE_COLORS[v.change_source] ?? { bg: "#e9ecef", color: "#495057" };
        const isOpen = expanded.has(v.id);

        return (
          <div key={v.id} style={{ position: "relative", marginBottom: "1.25rem" }}>
            {/* dot */}
            <div style={{
              position: "absolute", left: "-1.75rem", top: "10px",
              width: "14px", height: "14px",
              borderRadius: "50%",
              background: col.color,
              border: "2px solid #fff",
              boxShadow: "0 0 0 2px " + col.color,
            }} />

            {/* card */}
            <div
              onClick={() => toggle(v.id)}
              style={{
                background: "#fff",
                border: "1px solid #dee2e6",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  v{v.version_number}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem",
                  fontWeight: 600, background: col.bg, color: col.color,
                }}>
                  {v.change_source.replace("_", " ")}
                </span>
                <span style={{ color: "#6c757d", fontSize: "0.83rem" }}>
                  {new Date(v.created_at).toLocaleString()}
                </span>
                {v.changed_by_username && (
                  <span style={{ color: "#495057", fontSize: "0.83rem" }}>
                    by <strong>{v.changed_by_username}</strong>
                  </span>
                )}
                {v.note && (
                  <span style={{ color: "#6c757d", fontSize: "0.8rem", fontStyle: "italic" }}>
                    "{v.note}"
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: "#6c757d", fontSize: "0.8rem" }}>
                  {isOpen ? "▲ Hide diff" : "▼ Show diff"}
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: "0.75rem", borderTop: "1px solid #dee2e6", paddingTop: "0.75rem" }}>
                  <FieldDiff
                    before={prevVersion?.data_snapshot}
                    after={v.data_snapshot}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
