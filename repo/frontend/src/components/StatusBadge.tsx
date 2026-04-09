import type { RecipeStatus, DishStatus, MenuStatus } from "@/api/foodservice";

type AnyStatus = RecipeStatus | DishStatus | MenuStatus;

const BADGE_MAP: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:       { bg: "#e2e3e5", color: "#41464b", label: "Draft" },
  ACTIVE:      { bg: "#d1e7dd", color: "#0f5132", label: "Active" },
  SUPERSEDED:  { bg: "#fff3cd", color: "#664d03", label: "Superseded" },
  ARCHIVED:    { bg: "#f8d7da", color: "#842029", label: "Archived" },
  PUBLISHED:   { bg: "#cfe2ff", color: "#084298", label: "Published" },
  UNPUBLISHED: { bg: "#e2e3e5", color: "#41464b", label: "Unpublished" },
};

interface Props {
  status: AnyStatus;
}

export default function StatusBadge({ status }: Props) {
  const cfg = BADGE_MAP[status] ?? { bg: "#e2e3e5", color: "#41464b", label: status };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        letterSpacing: "0.03em",
      }}
    >
      {cfg.label}
    </span>
  );
}
