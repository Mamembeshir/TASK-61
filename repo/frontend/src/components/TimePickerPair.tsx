interface Props {
  startValue: string;   // "HH:MM" or ""
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  error?: string;
}

/** start + end time picker that enforces start < end when both provided. */
export default function TimePickerPair({ startValue, endValue, onStartChange, onEndChange, error }: Props) {
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid #ced4da",
    borderRadius: "6px",
    fontSize: "0.9rem",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="time"
          value={startValue}
          onChange={(e) => onStartChange(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: "#6c757d", fontSize: "0.85rem" }}>to</span>
        <input
          type="time"
          value={endValue}
          onChange={(e) => onEndChange(e.target.value)}
          style={inputStyle}
        />
      </div>
      {error && <div style={{ color: "#dc3545", fontSize: "0.8rem", marginTop: "4px" }}>{error}</div>}
    </div>
  );
}
