/**
 * Shared form element styles — exported separately so ui.tsx
 * can remain a pure React-component file (satisfies Vite Fast Refresh).
 */
import { colors, radius, font, shadows } from "@/styles/tokens";

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 13px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  fontSize: font.size.base,
  color: colors.text,
  background: colors.surface,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: font.family,
  lineHeight: 1.5,
  boxShadow: shadows.xs,
  transition: "border-color 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s cubic-bezier(0.4,0,0.2,1), background 0.18s cubic-bezier(0.4,0,0.2,1)",
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: "34px",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
  lineHeight: 1.55,
};
