import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { colors, radius, font, shadows } from "@/styles/tokens";

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
    <div style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      width: "100%",
      minWidth: 220,
    }}>
      <Search
        size={15}
        color={colors.textMuted}
        style={{
          position: "absolute",
          left: 12,
          pointerEvents: "none",
        }}
      />
      <input
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "9px 34px 9px 34px",
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          fontSize: font.size.base,
          fontFamily: font.family,
          color: colors.text,
          background: colors.surface,
          boxShadow: shadows.xs,
          outline: "none",
          transition: "border-color 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
      {local && (
        <button
          onClick={clear}
          style={{
            position: "absolute",
            right: 8,
            background: colors.gray100,
            border: "none",
            cursor: "pointer",
            color: colors.textSecondary,
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.gray200;
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.gray100;
            e.currentTarget.style.color = colors.textSecondary;
          }}
          title="Clear"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
