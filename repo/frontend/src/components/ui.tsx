/**
 * HarborOps UI Primitives
 * All shared building blocks — import from "@/components/ui"
 */
import React from "react";
import { colors, shadows, radius, font, transition } from "@/styles/tokens";

// ============================================================================
// CARD
// ============================================================================

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, style, padding = "1.5rem", onClick, hoverable }: CardProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        background: colors.surface,
        borderRadius: radius.lg,
        boxShadow: hovered ? shadows.lg : shadows.md,
        border: `1px solid ${colors.border}`,
        padding,
        cursor: onClick ? "pointer" : undefined,
        transition: `box-shadow ${transition.base}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// STAT CARD (metric card with accent top border)
// ============================================================================

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  to?: string;
  loading?: boolean;
}

export function StatCard({ label, value, icon, accent = colors.primary, loading }: StatCardProps) {
  return (
    <div style={{
      background: colors.surface,
      borderRadius: radius.lg,
      boxShadow: shadows.md,
      border: `1px solid ${colors.border}`,
      borderTop: `3px solid ${accent}`,
      padding: "1.25rem 1.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: accent + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: accent,
          }}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <SkeletonLine width="60px" height="28px" />
      ) : (
        <div style={{ fontSize: "1.75rem", fontWeight: font.weight.bold, color: colors.text, lineHeight: 1 }}>
          {value}
        </div>
      )}
      <div style={{ marginTop: "0.4rem", fontSize: font.size.sm, color: colors.textMuted, fontWeight: font.weight.medium }}>
        {label}
      </div>
    </div>
  );
}

// ============================================================================
// BADGE
// ============================================================================

interface BadgeProps {
  bg?: string;
  text?: string;
  label?: string;
  size?: "sm" | "md";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Badge({ bg, text, label, size = "md", children, style }: BadgeProps) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: size === "sm" ? "1px 8px" : "2px 10px",
      borderRadius: radius.full,
      fontSize: size === "sm" ? font.size.xs : font.size.sm,
      fontWeight: font.weight.semibold,
      background: bg ?? "transparent",
      color: text ?? "inherit",
      whiteSpace: "nowrap",
      letterSpacing: "0.01em",
      ...style,
    }}>
      {label ?? children}
    </span>
  );
}

// ============================================================================
// BUTTON
// ============================================================================

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const buttonVariantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary:   { background: colors.primary,   color: "#fff",           border: `1px solid ${colors.primary}` },
  secondary: { background: colors.gray100,   color: colors.text,      border: `1px solid ${colors.border}` },
  outline:   { background: "transparent",    color: colors.primary,   border: `1px solid ${colors.primary}` },
  ghost:     { background: "transparent",    color: colors.textSecondary, border: "1px solid transparent" },
  danger:    { background: colors.danger,    color: "#fff",           border: `1px solid ${colors.danger}` },
};

const buttonSizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "5px 12px",  fontSize: font.size.sm,   borderRadius: radius.md },
  md: { padding: "7px 16px",  fontSize: font.size.base, borderRadius: radius.md },
  lg: { padding: "10px 22px", fontSize: font.size.lg,   borderRadius: radius.md },
};

export function Button({
  variant = "primary", size = "md", loading, icon, children, disabled, style, ...rest
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const hoverMap: Record<ButtonVariant, React.CSSProperties> = {
    primary:   { background: colors.primaryHover, borderColor: colors.primaryHover },
    secondary: { background: colors.gray200 },
    outline:   { background: colors.primaryLight },
    ghost:     { background: colors.gray100 },
    danger:    { background: "#DC2626", borderColor: "#DC2626" },
  };

  return (
    <button
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: font.family,
        fontWeight: font.weight.semibold,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: `all ${transition.base}`,
        ...buttonVariantStyles[variant],
        ...buttonSizeStyles[size],
        ...(hovered && !disabled && !loading ? hoverMap[variant] : {}),
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
      {loading ? "Loading…" : children}
    </button>
  );
}

// ============================================================================
// PAGE HEADER
// ============================================================================

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "1.75rem",
      gap: "1rem",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        {icon && (
          <div style={{
            width: 42, height: 42, borderRadius: radius.md,
            background: colors.primaryLight,
            color: colors.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}>
            {icon}
          </div>
        )}
        <div>
          <h1 style={{
            margin: 0,
            fontSize: font.size.h2,
            fontWeight: font.weight.bold,
            color: colors.text,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: "0.3rem 0 0", fontSize: font.size.base, color: colors.textMuted }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TABLE
// ============================================================================

interface TableProps {
  columns: string[];
  children: React.ReactNode;
  stickyHeader?: boolean;
}

export function Table({ columns, children, stickyHeader }: TableProps) {
  return (
    <div style={{
      background: colors.surface,
      borderRadius: radius.lg,
      border: `1px solid ${colors.border}`,
      boxShadow: shadows.md,
      overflow: "hidden",
    }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: colors.gray50, borderBottom: `1px solid ${colors.border}` }}>
              {columns.map((col) => (
                <th key={col} style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: font.size.xs,
                  fontWeight: font.weight.semibold,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                  position: stickyHeader ? "sticky" : undefined,
                  top: stickyHeader ? 0 : undefined,
                  background: stickyHeader ? colors.gray50 : undefined,
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

interface TrProps {
  children: React.ReactNode;
  onClick?: () => void;
  muted?: boolean;
}

export function Tr({ children, onClick, muted }: TrProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: `1px solid ${colors.border}`,
        background: hovered && onClick ? colors.surfaceHover : colors.surface,
        cursor: onClick ? "pointer" : undefined,
        opacity: muted ? 0.5 : 1,
        transition: `background ${transition.fast}`,
      }}
    >
      {children}
    </tr>
  );
}

export function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: "12px 16px",
      fontSize: font.size.base,
      color: colors.text,
      verticalAlign: "middle",
      ...style,
    }}>
      {children}
    </td>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "4rem 2rem",
      textAlign: "center",
      color: colors.textMuted,
    }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "1rem", opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.textSecondary, marginBottom: "0.4rem" }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: font.size.base, color: colors.textMuted, maxWidth: "360px", lineHeight: 1.6 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: "1.5rem" }}>{action}</div>}
    </div>
  );
}

// ============================================================================
// SKELETON LOADERS
// ============================================================================

export function SkeletonLine({ width = "100%", height = "14px", style }: {
  width?: string; height?: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      width, height,
      background: `linear-gradient(90deg, ${colors.gray200} 25%, ${colors.gray100} 50%, ${colors.gray200} 75%)`,
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s ease infinite",
      borderRadius: radius.sm,
      ...style,
    }} />
  );
}

export function SkeletonCard() {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <SkeletonLine width="40%" height="18px" />
      <SkeletonLine width="70%" />
      <SkeletonLine width="55%" />
    </Card>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{
      background: colors.surface, borderRadius: radius.lg,
      border: `1px solid ${colors.border}`, boxShadow: shadows.md, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, background: colors.gray50 }}>
        <SkeletonLine width="200px" height="12px" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          padding: "14px 16px",
          borderBottom: i < rows - 1 ? `1px solid ${colors.border}` : undefined,
          display: "flex", gap: "1rem", alignItems: "center",
        }}>
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine key={j} width={`${[30, 20, 25, 15][j % 4]}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MODAL
// ============================================================================

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, width = "480px", footer }: ModalProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.5)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "1rem",
      }}
    >
      <div style={{
        background: colors.surface,
        borderRadius: radius.xl,
        boxShadow: shadows.xl,
        width: "100%",
        maxWidth: width,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <h2 style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              width: 32, height: 32, borderRadius: radius.md,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.textMuted, cursor: "pointer", fontSize: "1.25rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: "1rem 1.5rem",
            borderTop: `1px solid ${colors.border}`,
            display: "flex", justifyContent: "flex-end", gap: "0.5rem",
            background: colors.gray50,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ALERT / INLINE MESSAGE
// ============================================================================

type AlertType = "error" | "warning" | "success" | "info";

interface AlertBannerProps {
  type?: AlertType;
  message: string;
  onClose?: () => void;
}

const alertConfig: Record<AlertType, { bg: string; text: string; border: string }> = {
  error:   { bg: colors.dangerLight,  text: colors.dangerDark,  border: colors.danger },
  warning: { bg: colors.warningLight, text: colors.warningDark, border: colors.warning },
  success: { bg: colors.successLight, text: colors.successDark, border: colors.success },
  info:    { bg: colors.infoLight,    text: colors.infoDark,    border: colors.info },
};

export function AlertBanner({ type = "error", message, onClose }: AlertBannerProps) {
  const c = alertConfig[type];
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      background: c.bg,
      color: c.text,
      borderRadius: radius.md,
      border: `1px solid ${c.border}30`,
      fontSize: font.size.base,
      marginBottom: "1rem",
    }}>
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{
          background: "none", border: "none",
          color: c.text, cursor: "pointer",
          fontSize: "1.1rem", lineHeight: 1, opacity: 0.7,
          marginLeft: "1rem",
        }}>×</button>
      )}
    </div>
  );
}

// ============================================================================
// FORM PRIMITIVES
// ============================================================================

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

export function Field({ label, required, error, children, hint }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{
        fontSize: font.size.sm,
        fontWeight: font.weight.semibold,
        color: colors.textSecondary,
      }}>
        {label}
        {required && <span style={{ color: colors.danger, marginLeft: "3px" }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <span style={{ fontSize: font.size.xs, color: colors.textMuted }}>{hint}</span>
      )}
      {error && (
        <span style={{ fontSize: font.size.xs, color: colors.danger }}>{error}</span>
      )}
    </div>
  );
}

// Form styles are available at "@/styles/forms" — not re-exported here
// so this file stays pure-component and Vite Fast Refresh works correctly.

// ============================================================================
// PAGINATION
// ============================================================================

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, total, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginTop: "1rem", padding: "0.5rem 0",
    }}>
      <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>
        {total} total
      </span>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Button variant="secondary" size="sm" onClick={onPrev} disabled={page === 1}>
          ← Prev
        </Button>
        <span style={{ fontSize: font.size.sm, color: colors.textSecondary, minWidth: "80px", textAlign: "center" }}>
          {page} / {totalPages}
        </span>
        <Button variant="secondary" size="sm" onClick={onNext} disabled={page === totalPages}>
          Next →
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION DIVIDER
// ============================================================================

export function Divider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
      <div style={{ flex: 1, height: "1px", background: colors.border }} />
      {label && (
        <span style={{ fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.medium, whiteSpace: "nowrap" }}>
          {label}
        </span>
      )}
      {label && <div style={{ flex: 1, height: "1px", background: colors.border }} />}
    </div>
  );
}

// ============================================================================
// SHIMMER keyframes injection (once on load)
// ============================================================================
if (typeof document !== "undefined") {
  const id = "__harbor_shimmer__";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`;
    document.head.appendChild(style);
  }
}
