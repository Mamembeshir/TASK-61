/**
 * HarborOps Design System — single source of truth for all visual tokens.
 * All components reference these values instead of hardcoded strings.
 */

export const colors = {
  // Brand
  primary:       "#6366F1",   // indigo-500
  primaryHover:  "#4F46E5",   // indigo-600
  primaryLight:  "#EEF2FF",   // indigo-50
  primaryMid:    "#C7D2FE",   // indigo-200

  // Sidebar
  sidebarBg:     "#0F172A",   // slate-900
  sidebarHover:  "rgba(255,255,255,0.08)",
  sidebarActive: "rgba(99,102,241,0.25)",
  sidebarText:   "rgba(255,255,255,0.65)",
  sidebarTextActive: "#FFFFFF",

  // Surfaces
  bg:            "#F1F5F9",   // slate-100
  surface:       "#FFFFFF",
  surfaceHover:  "#F8FAFC",   // slate-50
  border:        "#E2E8F0",   // slate-200
  borderFocus:   "#6366F1",

  // Text
  text:          "#0F172A",   // slate-900
  textSecondary: "#475569",   // slate-600
  textMuted:     "#94A3B8",   // slate-400
  textOnPrimary: "#FFFFFF",

  // Semantic
  success:       "#10B981",   // emerald-500
  successLight:  "#D1FAE5",   // emerald-100
  successDark:   "#065F46",   // emerald-800

  warning:       "#F59E0B",   // amber-500
  warningLight:  "#FEF3C7",   // amber-100
  warningDark:   "#92400E",   // amber-800

  danger:        "#EF4444",   // red-500
  dangerLight:   "#FEE2E2",   // red-100
  dangerDark:    "#991B1B",   // red-800

  info:          "#3B82F6",   // blue-500
  infoLight:     "#DBEAFE",   // blue-100
  infoDark:      "#1E40AF",   // blue-800

  // Neutral
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

export const shadows = {
  sm:     "0 1px 2px rgba(0,0,0,0.05)",
  md:     "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
  lg:     "0 4px 6px rgba(0,0,0,0.07), 0 10px 40px rgba(0,0,0,0.08)",
  xl:     "0 20px 60px rgba(0,0,0,0.16)",
  focus:  "0 0 0 3px rgba(99,102,241,0.25)",
} as const;

export const radius = {
  sm:   "4px",
  md:   "8px",
  lg:   "12px",
  xl:   "16px",
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
  family: "'Inter', system-ui, -apple-system, sans-serif",
  size: {
    xs:   "0.75rem",    // 12px
    sm:   "0.8125rem",  // 13px
    base: "0.875rem",   // 14px
    md:   "0.9375rem",  // 15px
    lg:   "1rem",       // 16px
    xl:   "1.125rem",   // 18px
    xxl:  "1.25rem",    // 20px
    h3:   "1.125rem",
    h2:   "1.375rem",
    h1:   "1.75rem",
  },
  weight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
} as const;

export const transition = {
  fast:   "0.1s ease",
  base:   "0.15s ease",
  slow:   "0.25s ease",
} as const;

// ---------------------------------------------------------------------------
// Status / badge colour maps — shared across all pages
// ---------------------------------------------------------------------------

export const meetingStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:       { bg: colors.gray200,    text: colors.gray700,    label: "Draft" },
  SCHEDULED:   { bg: colors.infoLight,  text: colors.infoDark,   label: "Scheduled" },
  IN_PROGRESS: { bg: colors.warningLight, text: colors.warningDark, label: "In Progress" },
  COMPLETED:   { bg: colors.successLight, text: colors.successDark, label: "Completed" },
  CANCELLED:   { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Cancelled" },
};

export const taskStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  TODO:        { bg: colors.gray100,    text: colors.gray600,    label: "To Do" },
  IN_PROGRESS: { bg: colors.infoLight,  text: colors.infoDark,   label: "In Progress" },
  DONE:        { bg: colors.successLight, text: colors.successDark, label: "Done" },
  OVERDUE:     { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Overdue" },
  CANCELLED:   { bg: colors.gray200,    text: colors.gray600,    label: "Cancelled" },
};

export const userStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  PENDING_REVIEW: { bg: colors.warningLight, text: colors.warningDark, label: "Pending Review" },
  ACTIVE:         { bg: colors.successLight, text: colors.successDark, label: "Active" },
  SUSPENDED:      { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Suspended" },
  DEACTIVATED:    { bg: colors.gray200,      text: colors.gray600,     label: "Deactivated" },
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
