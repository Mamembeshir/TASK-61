import type { RecipeStatus, DishStatus, MenuStatus } from "@/api/foodservice";
import { Badge } from "@/components/ui";
import { colors } from "@/styles/tokens";

type AnyStatus = RecipeStatus | DishStatus | MenuStatus;

const BADGE_MAP: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:       { bg: colors.gray100,     text: colors.gray600,    label: "Draft"       },
  ACTIVE:      { bg: colors.successLight, text: colors.successDark, label: "Active"      },
  SUPERSEDED:  { bg: colors.warningLight, text: colors.warningDark, label: "Superseded"  },
  ARCHIVED:    { bg: colors.dangerLight,  text: colors.dangerDark,  label: "Archived"    },
  PUBLISHED:   { bg: colors.infoLight,    text: colors.infoDark,    label: "Published"   },
  UNPUBLISHED: { bg: colors.gray200,      text: colors.gray700,     label: "Unpublished" },
};

interface Props {
  status: AnyStatus;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "sm" }: Props) {
  const cfg = BADGE_MAP[status] ?? { bg: colors.gray200, text: colors.gray700, label: status };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} size={size} dot />;
}
