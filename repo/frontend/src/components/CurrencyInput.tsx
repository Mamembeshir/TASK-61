import { useState } from "react";

interface Props {
  value: string;              // stored as raw decimal string e.g. "5.25"
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

/** Displays as $X.XX when blurred, plain number when focused. */
export default function CurrencyInput({ value, onChange, disabled, placeholder, style }: Props) {
  const [focused, setFocused] = useState(false);

  const display = focused
    ? value
    : value
    ? `$${parseFloat(value || "0").toFixed(2)}`
    : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder ?? "$0.00"}
      disabled={disabled}
      style={{
        padding: "6px 10px",
        border: "1px solid #ced4da",
        borderRadius: "6px",
        fontSize: "0.9rem",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        onChange(raw);
      }}
    />
  );
}
