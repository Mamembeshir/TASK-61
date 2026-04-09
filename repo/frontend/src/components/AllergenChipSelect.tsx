import type { Allergen } from "@/api/foodservice";

const CHIP_COLORS: Record<string, { bg: string; color: string }> = {
  GLUTEN:     { bg: "#fff3cd", color: "#664d03" },
  MILK:       { bg: "#d1e7dd", color: "#0f5132" },
  EGG:        { bg: "#cfe2ff", color: "#084298" },
  PEANUT:     { bg: "#f8d7da", color: "#842029" },
  TREENUT:    { bg: "#e2d9f3", color: "#4a1a80" },
  SOY:        { bg: "#d1e7dd", color: "#0f5132" },
  FISH:       { bg: "#cff4fc", color: "#055160" },
  SHELLFISH:  { bg: "#ffd6a5", color: "#6b3a00" },
  SESAME:     { bg: "#e2e3e5", color: "#41464b" },
  MUSTARD:    { bg: "#fff3cd", color: "#664d03" },
  CELERY:     { bg: "#d1e7dd", color: "#0f5132" },
  LUPIN:      { bg: "#cfe2ff", color: "#084298" },
  MOLLUSC:    { bg: "#ffd6a5", color: "#6b3a00" },
  SULPHITE:   { bg: "#e2d9f3", color: "#4a1a80" },
  NONE:       { bg: "#e2e3e5", color: "#41464b" },
};

interface Props {
  allergens: Allergen[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

export default function AllergenChipSelect({ allergens, selectedIds, onChange, error }: Props) {
  const selectedSet = new Set(selectedIds);
  const noneAllergen = allergens.find((a) => a.code === "NONE");
  const noneSelected = noneAllergen ? selectedSet.has(noneAllergen.id) : false;

  function toggle(allergen: Allergen) {
    if (allergen.code === "NONE") {
      // Selecting NONE deselects everything else
      if (noneSelected) {
        onChange([]);
      } else {
        onChange([allergen.id]);
      }
    } else {
      // Selecting non-NONE deselects NONE
      const next = new Set(selectedIds.filter((id) => id !== noneAllergen?.id));
      if (next.has(allergen.id)) {
        next.delete(allergen.id);
      } else {
        next.add(allergen.id);
      }
      onChange(Array.from(next));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {allergens.map((a) => {
          const selected = selectedSet.has(a.id);
          const disabled = !selected && noneSelected && a.code !== "NONE";
          const colors = CHIP_COLORS[a.code] ?? { bg: "#e2e3e5", color: "#41464b" };
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(a)}
              style={{
                padding: "4px 12px",
                borderRadius: "16px",
                border: selected ? "2px solid currentColor" : "2px solid transparent",
                background: selected ? colors.bg : "#f8f9fa",
                color: selected ? colors.color : "#6c757d",
                cursor: disabled ? "not-allowed" : "pointer",
                fontSize: "0.8rem",
                fontWeight: selected ? 600 : 400,
                opacity: disabled ? 0.45 : 1,
                transition: "all 0.1s",
              }}
            >
              {a.name}
            </button>
          );
        })}
      </div>
      {error && <div style={{ color: "#dc3545", fontSize: "0.8rem", marginTop: "6px" }}>{error}</div>}
    </div>
  );
}
