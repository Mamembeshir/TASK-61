/**
 * FieldDiff — renders the difference between two data_snapshot objects.
 * Green = added, red = removed, yellow = changed.
 */

interface Props {
  before: Record<string, string> | null | undefined;
  after:  Record<string, string> | null | undefined;
}

export default function FieldDiff({ before, after }: Props) {
  const prev = before ?? {};
  const next = after  ?? {};
  const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).sort();

  if (allKeys.length === 0) {
    return <span style={{ color: "#6c757d", fontSize: "0.85rem" }}>No custom fields.</span>;
  }

  const rows = allKeys.map((key) => {
    const oldVal = prev[key];
    const newVal = next[key];

    if (oldVal === undefined) {
      // added
      return { key, type: "added",   oldVal: null,   newVal };
    } else if (newVal === undefined) {
      // removed
      return { key, type: "removed", oldVal, newVal: null };
    } else if (oldVal !== newVal) {
      // changed
      return { key, type: "changed", oldVal, newVal };
    } else {
      // unchanged
      return { key, type: "same",    oldVal, newVal };
    }
  });

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
      <thead>
        <tr>
          <th style={thStyle}>Field</th>
          <th style={thStyle}>Before</th>
          <th style={thStyle}>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, type, oldVal, newVal }) => {
          const bg =
            type === "added"   ? "#d1e7dd" :
            type === "removed" ? "#f8d7da" :
            type === "changed" ? "#fff3cd" : "transparent";
          return (
            <tr key={key} style={{ background: bg, borderBottom: "1px solid #dee2e6" }}>
              <td style={tdStyle}><code>{key}</code></td>
              <td style={{ ...tdStyle, color: type === "added" ? "#6c757d" : "#842029" }}>
                {oldVal ?? "—"}
              </td>
              <td style={{ ...tdStyle, color: type === "removed" ? "#6c757d" : "#0a3622" }}>
                {newVal ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontWeight: 600,
  fontSize: "0.78rem",
  color: "#6c757d",
  textAlign: "left",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 10px",
};
