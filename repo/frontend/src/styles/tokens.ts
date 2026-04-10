/**
 * HarborOps Design System — single source of truth for all visual tokens.
 * All components reference these values instead of hardcoded strings.
 */

export const colors = {
  // Brand — refined indigo/violet palette
  primary:       "#4F46E5",   // indigo-600  (richer, more premium than 500)
  primaryHover:  "#4338CA",   // indigo-700
  primaryActive: "#3730A3",   // indigo-800
  primaryLight:  "#EEF2FF",   // indigo-50
  primaryMid:    "#C7D2FE",   // indigo-200
  primarySoft:   "#E0E7FF",   // indigo-100

  // Accent — violet pop used in gradients
  accent:        "#7C3AED",   // violet-600
  accentLight:   "#F5F3FF",   // violet-50

  // Sidebar — darker, cooler slate with subtle violet tint
  sidebarBg:     "#0B1120",   // near-black slate
  sidebarBgEnd:  "#0F172A",   // slate-900 (for gradient)
  sidebarHover:  "rgba(255,255,255,0.06)",
  sidebarActive: "rgba(99,102,241,0.18)",
  sidebarText:   "rgba(226,232,240,0.72)",
  sidebarTextActive: "#FFFFFF",
  sidebarBorder: "rgba(255,255,255,0.06)",

  // Surfaces
  bg:            "#F6F7FB",   // slightly warmer than slate-100
  bgAlt:         "#EFF1F7",   // for contrasting panels
  surface:       "#FFFFFF",
  surfaceAlt:    "#FAFBFD",
  surfaceHover:  "#F5F7FA",
  surfaceMuted:  "#F1F3F9",
  border:        "#E5E7EF",   // softer than slate-200
  borderStrong:  "#D1D5DB",
  borderFocus:   "#4F46E5",

  // Text
  text:          "#0F172A",   // slate-900
  textSecondary: "#475569",   // slate-600
  textMuted:     "#94A3B8",   // slate-400
  textOnPrimary: "#FFFFFF",

  // Semantic — Light = 100 (badge background), Soft = 50 (surface tint)
  success:       "#10B981",   // emerald-500
  successSoft:   "#ECFDF5",   // emerald-50
  successLight:  "#D1FAE5",   // emerald-100
  successDark:   "#065F46",   // emerald-800

  warning:       "#F59E0B",   // amber-500
  warningSoft:   "#FFFBEB",   // amber-50
  warningLight:  "#FEF3C7",   // amber-100
  warningDark:   "#92400E",   // amber-800

  danger:        "#EF4444",   // red-500
  dangerSoft:    "#FEF2F2",   // red-50
  dangerLight:   "#FEE2E2",   // red-100
  dangerDark:    "#991B1B",   // red-800

  info:          "#3B82F6",   // blue-500
  infoSoft:      "#EFF6FF",   // blue-50
  infoLight:     "#DBEAFE",   // blue-100
  infoDark:      "#1E40AF",   // blue-800

  // Neutral (slate scale — keep raw access for special cases)
  gray50:  "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",
} as const;

// ---------------------------------------------------------------------------
// Gradients — use as `background: gradients.primary`
// ---------------------------------------------------------------------------
export const gradients = {
  primary:     "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
  primarySoft: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)",
  sidebar:     "linear-gradient(180deg, #0B1120 0%, #0F172A 100%)",
  hero:        "linear-gradient(135deg, #0F172A 0%, #1E1B4B 45%, #312E81 100%)",
  heroMesh:    "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.28) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(124,58,237,0.22) 0%, transparent 45%), linear-gradient(135deg, #0B1120 0%, #1E1B4B 100%)",
  success:     "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  danger:      "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
  surface:     "linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%)",
} as const;

// ---------------------------------------------------------------------------
// Shadows — softer, more layered (premium feel)
// ---------------------------------------------------------------------------
export const shadows = {
  xs:     "0 1px 2px rgba(15,23,42,0.04)",
  sm:     "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
  md:     "0 2px 4px rgba(15,23,42,0.04), 0 6px 20px -4px rgba(15,23,42,0.08)",
  lg:     "0 4px 8px rgba(15,23,42,0.06), 0 16px 40px -8px rgba(15,23,42,0.12)",
  xl:     "0 8px 16px rgba(15,23,42,0.08), 0 32px 64px -16px rgba(15,23,42,0.18)",
  "2xl":  "0 16px 48px -8px rgba(15,23,42,0.24), 0 48px 96px -24px rgba(79,70,229,0.14)",
  focus:  "0 0 0 3px rgba(79,70,229,0.18)",
  focusRing: "0 0 0 4px rgba(79,70,229,0.12), 0 0 0 1.5px rgba(79,70,229,0.6)",
  glow:   "0 0 0 1px rgba(79,70,229,0.2), 0 8px 24px rgba(79,70,229,0.16)",
} as const;

export const radius = {
  xs:   "4px",
  sm:   "6px",
  md:   "8px",
  lg:   "12px",
  xl:   "16px",
  "2xl":"20px",
  full: "9999px",
} as const;

export const spacing = {
  xs:  "4px",
  sm:  "8px",
  md:  "12px",
  lg:  "16px",
  xl:  "24px",
  xxl: "32px",
} as const;

export const font = {
  family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  familyMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace",
  size: {
    xs:   "0.75rem",    // 12px
    sm:   "0.8125rem",  // 13px
    base: "0.875rem",   // 14px
    md:   "0.9375rem",  // 15px
    lg:   "1rem",       // 16px
    xl:   "1.125rem",   // 18px
    xxl:  "1.25rem",    // 20px
    h3:   "1.125rem",
    h2:   "1.5rem",     // was 1.375 — more presence
    h1:   "1.875rem",   // was 1.75 — more presence
  },
  weight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  tracking: {
    tight:  "-0.02em",
    tighter:"-0.03em",
    normal: "0",
    wide:   "0.02em",
    wider:  "0.06em",
  },
} as const;

export const transition = {
  fast:   "0.12s cubic-bezier(0.4, 0, 0.2, 1)",
  base:   "0.18s cubic-bezier(0.4, 0, 0.2, 1)",
  slow:   "0.28s cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// ---------------------------------------------------------------------------
// Status / badge colour maps — shared across all pages
// ---------------------------------------------------------------------------

export const meetingStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:       { bg: colors.gray200,    text: colors.gray700,    label: "Draft" },
  SCHEDULED:   { bg: colors.infoLight,    text: colors.infoDark,   label: "Scheduled" },
  IN_PROGRESS: { bg: colors.warningLight, text: colors.warningDark, label: "In Progress" },
  COMPLETED:   { bg: colors.successLight, text: colors.successDark, label: "Completed" },
  CANCELLED:   { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Cancelled" },
};

export const taskStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  TODO:        { bg: colors.gray100,    text: colors.gray600,    label: "To Do" },
  IN_PROGRESS: { bg: colors.infoLight,    text: colors.infoDark,   label: "In Progress" },
  DONE:        { bg: colors.successLight, text: colors.successDark, label: "Done" },
  OVERDUE:     { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Overdue" },
  CANCELLED:   { bg: colors.gray200,    text: colors.gray600,    label: "Cancelled" },
};

export const userStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  PENDING_REVIEW: { bg: colors.warningLight, text: colors.warningDark, label: "Pending Review" },
  ACTIVE:         { bg: colors.successLight, text: colors.successDark, label: "Active" },
  SUSPENDED:      { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Suspended" },
  DEACTIVATED:    { bg: colors.gray200,    text: colors.gray600,     label: "Deactivated" },
};

export const roleColors: Record<string, { bg: string; text: string }> = {
  ADMIN:   { bg: colors.primaryLight, text: colors.primary },
  STAFF:   { bg: colors.gray100,      text: colors.gray600 },
  COURIER: { bg: "#F3E8FF",           text: "#7C3AED" },
};

export const alertSeverityColors: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Critical" },
  WARNING:  { bg: colors.warningLight, text: colors.warningDark, label: "Warning" },
  INFO:     { bg: colors.infoLight,    text: colors.infoDark,    label: "Info" },
};

export const alertStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  OPEN:         { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Open" },
  ACKNOWLEDGED: { bg: colors.warningLight, text: colors.warningDark, label: "Acknowledged" },
  ASSIGNED:     { bg: colors.infoLight,    text: colors.infoDark,    label: "Assigned" },
  CLOSED:       { bg: colors.successLight, text: colors.successDark, label: "Closed" },
};
