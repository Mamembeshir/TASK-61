/**
 * HarborOps UI Primitives
 * All shared building blocks — import from "@/components/ui"
 */
import React from "react";
import { colors, shadows, radius, font, transition, gradients } from "@/styles/tokens";

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
  const interactive = Boolean(onClick || hoverable);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
      style={{
        background: colors.surface,
        borderRadius: radius.lg,
        boxShadow: hovered ? shadows.lg : shadows.sm,
        border: `1px solid ${hovered && interactive ? "#DDE1EC" : colors.border}`,
        padding,
        cursor: onClick ? "pointer" : undefined,
        transform: hovered && interactive ? "translateY(-1px)" : "translateY(0)",
        transition: `box-shadow ${transition.base}, transform ${transition.base}, border-color ${transition.base}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// STAT CARD (metric card with glow + icon tile)
// ============================================================================

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
  to?: string;
  loading?: boolean;
  delta?: string;
  deltaPositive?: boolean;
}

export function StatCard({ label, value, icon, accent = colors.primary, loading, delta, deltaPositive }: StatCardProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: colors.surface,
        borderRadius: radius.lg,
        boxShadow: hovered ? shadows.lg : shadows.sm,
        border: `1px solid ${colors.border}`,
        padding: "1.3rem 1.4rem 1.4rem",
        overflow: "hidden",
        transition: `box-shadow ${transition.base}, transform ${transition.base}`,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      {/* accent glow in top-right corner */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -50, right: -50,
          width: 160, height: 160,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "1rem",
        position: "relative",
      }}>
        {icon && (
          <div style={{
            width: 44, height: 44, borderRadius: radius.md,
            background: `linear-gradient(135deg, ${accent}1f 0%, ${accent}0f 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}>
            {icon}
          </div>
        )}
        {delta && (
          <span style={{
            fontSize: font.size.xs,
            fontWeight: font.weight.semibold,
            padding: "3px 9px",
            borderRadius: radius.full,
            background: deltaPositive ? colors.successLight : colors.dangerLight,
            color: deltaPositive ? colors.successDark : colors.dangerDark,
          }}>
            {delta}
          </span>
        )}
      </div>
      {loading ? (
        <SkeletonLine width="70px" height="32px" />
      ) : (
        <div style={{
          fontSize: "1.95rem",
          fontWeight: font.weight.bold,
          color: colors.text,
          lineHeight: 1,
          letterSpacing: font.tracking.tight,
          position: "relative",
          fontVariantNumeric: "tabular-nums",
        }}>
          {value}
        </div>
      )}
      <div style={{
        marginTop: "0.55rem",
        fontSize: font.size.sm,
        color: colors.textMuted,
        fontWeight: font.weight.medium,
        letterSpacing: "0.01em",
        position: "relative",
      }}>
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
  dot?: boolean;
}

export function Badge({ bg, text, label, size = "md", children, style, dot }: BadgeProps) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: dot ? 6 : 0,
      padding: size === "sm" ? "2px 9px" : "3px 11px",
      borderRadius: radius.full,
      fontSize: size === "sm" ? font.size.xs : font.size.sm,
      fontWeight: font.weight.semibold,
      background: bg ?? "transparent",
      color: text ?? "inherit",
      whiteSpace: "nowrap",
      letterSpacing: "0.01em",
      lineHeight: 1.5,
      ...style,
    }}>
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: text ?? "currentColor",
          flexShrink: 0,
        }} />
      )}
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
  primary: {
    background: gradients.primary,
    color: "#fff",
    border: `1px solid ${colors.primary}`,
    boxShadow: "0 1px 2px rgba(15,23,42,0.08), 0 1px 3px rgba(79,70,229,0.28)",
  },
  secondary: {
    background: colors.surface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.xs,
  },
  outline: {
    background: "transparent",
    color: colors.primary,
    border: `1px solid ${colors.primaryMid}`,
  },
  ghost: {
    background: "transparent",
    color: colors.textSecondary,
    border: "1px solid transparent",
  },
  danger: {
    background: gradients.danger,
    color: "#fff",
    border: `1px solid ${colors.danger}`,
    boxShadow: "0 1px 2px rgba(15,23,42,0.08), 0 1px 3px rgba(239,68,68,0.3)",
  },
};

const buttonSizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "0 13px",  fontSize: font.size.sm,   borderRadius: radius.md, height: 32 },
  md: { padding: "0 18px",  fontSize: font.size.base, borderRadius: radius.md, height: 38 },
  lg: { padding: "0 24px",  fontSize: font.size.md,   borderRadius: radius.lg, height: 44 },
};

export function Button({
  variant = "primary", size = "md", loading, icon, children, disabled, style, ...rest
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const hoverMap: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)",
      boxShadow: "0 2px 4px rgba(15,23,42,0.1), 0 8px 18px -4px rgba(79,70,229,0.35)",
    },
    secondary: { background: colors.surfaceHover, borderColor: colors.borderStrong },
    outline: { background: colors.primaryLight, borderColor: colors.primary },
    ghost: { background: colors.gray100, color: colors.text },
    danger: {
      background: "linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)",
      boxShadow: "0 2px 4px rgba(15,23,42,0.1), 0 8px 18px -4px rgba(239,68,68,0.35)",
    },
  };

  return (
    <button
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "7px",
        fontFamily: font.family,
        fontWeight: font.weight.semibold,
        letterSpacing: "0.005em",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: `background ${transition.fast}, box-shadow ${transition.fast}, transform ${transition.fast}, border-color ${transition.fast}`,
        transform: pressed ? "translateY(1px)" : "translateY(0)",
        userSelect: "none",
        whiteSpace: "nowrap",
        ...buttonVariantStyles[variant],
        ...buttonSizeStyles[size],
        ...(hovered && !disabled && !loading ? hoverMap[variant] : {}),
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span style={{
          width: 14, height: 14,
          borderRadius: "50%",
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          animation: "hb-spin 0.7s linear infinite",
        }} />
      ) : icon ? (
        <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      ) : null}
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
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.9rem", minWidth: 0, flex: "1 1 260px" }}>
        {icon && (
          <div
            className="hb-page-icon"
            style={{
              width: 48, height: 48, borderRadius: radius.lg,
              background: gradients.primarySoft,
              color: colors.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              marginTop: "2px",
              boxShadow: `inset 0 0 0 1px ${colors.primaryMid}66, 0 1px 2px rgba(79,70,229,0.08)`,
            }}>
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h1
            className="hb-page-title"
            style={{
              margin: 0,
              fontSize: font.size.h1,
              fontWeight: font.weight.bold,
              color: colors.text,
              letterSpacing: font.tracking.tighter,
              lineHeight: 1.15,
              overflowWrap: "break-word",
            }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              margin: "0.45rem 0 0",
              fontSize: font.size.md,
              color: colors.textSecondary,
              fontWeight: font.weight.normal,
              lineHeight: 1.5,
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
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
      boxShadow: shadows.sm,
      overflow: "hidden",
    }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{
              background: colors.surfaceAlt,
              borderBottom: `1px solid ${colors.border}`,
            }}>
              {columns.map((col) => (
                <th key={col} style={{
                  padding: "13px 18px",
                  textAlign: "left",
                  fontSize: font.size.xs,
                  fontWeight: font.weight.semibold,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: font.tracking.wider,
                  whiteSpace: "nowrap",
                  position: stickyHeader ? "sticky" : undefined,
                  top: stickyHeader ? 0 : undefined,
                  background: stickyHeader ? colors.surfaceAlt : undefined,
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
      padding: "14px 18px",
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
      padding: "4.5rem 2rem",
      textAlign: "center",
      color: colors.textMuted,
    }}>
      <div style={{
        width: 72, height: 72,
        borderRadius: radius.xl,
        background: gradients.primarySoft,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "2rem",
        marginBottom: "1.25rem",
        boxShadow: `inset 0 0 0 1px ${colors.primaryMid}44`,
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: font.size.lg,
        fontWeight: font.weight.semibold,
        color: colors.text,
        marginBottom: "0.4rem",
        letterSpacing: font.tracking.tight,
      }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: font.size.base, color: colors.textMuted, maxWidth: "380px", lineHeight: 1.6 }}>
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
      animation: "hb-shimmer 1.6s ease-in-out infinite",
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
      border: `1px solid ${colors.border}`, boxShadow: shadows.sm, overflow: "hidden",
    }}>
      <div style={{ padding: "13px 18px", borderBottom: `1px solid ${colors.border}`, background: colors.surfaceAlt }}>
        <SkeletonLine width="200px" height="12px" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          padding: "16px 18px",
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
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "1rem",
        animation: "hb-fade-in 0.2s ease both",
      }}
    >
      <div style={{
        background: colors.surface,
        borderRadius: radius.xl,
        boxShadow: shadows["2xl"],
        border: `1px solid ${colors.border}`,
        width: "100%",
        // Never wider than the viewport minus the outer 1rem padding on each side.
        maxWidth: `min(${width}, calc(100vw - 2rem))`,
        maxHeight: "calc(100vh - 2rem)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "hb-scale-in 0.22s cubic-bezier(0.4, 0, 0.2, 1) both",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1.25rem 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <h2 style={{
            fontSize: font.size.xl,
            fontWeight: font.weight.bold,
            color: colors.text,
            letterSpacing: font.tracking.tight,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: colors.gray100,
              border: "none",
              width: 30, height: 30, borderRadius: radius.md,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.textSecondary, cursor: "pointer", fontSize: "1.1rem",
              lineHeight: 1,
              transition: `background ${transition.fast}, color ${transition.fast}`,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = colors.gray200;
              (e.currentTarget as HTMLElement).style.color = colors.text;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = colors.gray100;
              (e.currentTarget as HTMLElement).style.color = colors.textSecondary;
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
            display: "flex", justifyContent: "flex-end", gap: "0.6rem",
            background: colors.surfaceAlt,
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

const alertConfig: Record<AlertType, { bg: string; text: string; border: string; soft: string }> = {
  error:   { bg: colors.dangerLight,  text: colors.dangerDark,  border: colors.danger,  soft: colors.dangerSoft  },
  warning: { bg: colors.warningLight, text: colors.warningDark, border: colors.warning, soft: colors.warningSoft },
  success: { bg: colors.successLight, text: colors.successDark, border: colors.success, soft: colors.successSoft },
  info:    { bg: colors.infoLight,    text: colors.infoDark,    border: colors.info,    soft: colors.infoSoft    },
};

export function AlertBanner({ type = "error", message, onClose }: AlertBannerProps) {
  const c = alertConfig[type];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "12px 16px",
      background: c.soft,
      color: c.text,
      borderRadius: radius.md,
      border: `1px solid ${c.bg}`,
      borderLeft: `3px solid ${c.border}`,
      fontSize: font.size.base,
      marginBottom: "1rem",
      lineHeight: 1.5,
    }}>
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{
          background: "none", border: "none",
          color: c.text, cursor: "pointer",
          fontSize: "1.1rem", lineHeight: 1, opacity: 0.7,
          marginLeft: "1rem",
          padding: 0,
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
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{
        fontSize: font.size.sm,
        fontWeight: font.weight.semibold,
        color: colors.textSecondary,
        letterSpacing: "0.005em",
      }}>
        {label}
        {required && <span style={{ color: colors.danger, marginLeft: "3px" }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <span style={{ fontSize: font.size.xs, color: colors.textMuted }}>{hint}</span>
      )}
      {error && (
        <span style={{ fontSize: font.size.xs, color: colors.danger, fontWeight: font.weight.medium }}>{error}</span>
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
        <span style={{ fontSize: font.size.sm, color: colors.textSecondary, minWidth: "80px", textAlign: "center", fontWeight: font.weight.medium }}>
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
        <span style={{
          fontSize: font.size.xs,
          color: colors.textMuted,
          fontWeight: font.weight.semibold,
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          letterSpacing: font.tracking.wider,
        }}>
          {label}
        </span>
      )}
      {label && <div style={{ flex: 1, height: "1px", background: colors.border }} />}
    </div>
  );
}
