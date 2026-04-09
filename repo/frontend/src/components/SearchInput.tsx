import { useState, useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/**
 * Debounced search input with a clear (×) button.
 * `onChange` fires after the user stops typing for `debounceMs` ms.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  debounceMs = 300,
}: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if parent resets value externally
  useEffect(() => { setLocal(value); }, [value]);

  function handleChange(raw: string) {
    setLocal(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(raw), debounceMs);
  }

  function clear() {
    setLocal("");
    if (timer.current) clearTimeout(timer.current);
    onChange("");
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <input
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "6px 32px 6px 10px",
          border: "1px solid #ced4da",
          borderRadius: "6px",
          fontSize: "0.9rem",
          minWidth: "200px",
        }}
      />
      {local && (
        <button
          onClick={clear}
          style={{
            position: "absolute", right: "8px",
            background: "none", border: "none",
            cursor: "pointer", color: "#6c757d",
            fontSize: "1rem", lineHeight: 1, padding: 0,
          }}
          title="Clear"
        >
          ×
        </button>
      )}
    </div>
  );
}
