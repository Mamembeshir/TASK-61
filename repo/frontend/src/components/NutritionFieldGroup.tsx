interface NutritionValues {
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

interface Props {
  values: NutritionValues;
  onChange: (field: keyof NutritionValues, value: string) => void;
  error?: string;
}

export default function NutritionFieldGroup({ values, onChange, error }: Props) {
  const anyFilled = Object.values(values).some((v) => v !== "");
  const allFilled = Object.values(values).every((v) => v !== "");
  const partial   = anyFilled && !allFilled;

  const fields: { key: keyof NutritionValues; label: string; unit: string }[] = [
    { key: "calories",  label: "Calories",  unit: "kcal" },
    { key: "protein_g", label: "Protein",   unit: "g" },
    { key: "carbs_g",   label: "Carbs",     unit: "g" },
    { key: "fat_g",     label: "Fat",       unit: "g" },
  ];

  const inputBorder = partial ? "1.5px solid #ffc107" : "1px solid #ced4da";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
        {fields.map(({ key, label, unit }) => (
          <div key={key}>
            <label style={{ fontSize: "0.8rem", color: partial ? "#856404" : "#495057", fontWeight: 500 }}>
              {label} {partial && <span style={{ color: "#dc3545" }}>*</span>}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
              <input
                type="number"
                min="0"
                step="0.1"
                value={values[key]}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder="—"
                style={{
                  padding: "6px 8px",
                  border: inputBorder,
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "#6c757d", whiteSpace: "nowrap" }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
      {partial && (
        <div style={{ marginTop: "6px", fontSize: "0.8rem", color: "#856404", background: "#fff3cd", padding: "6px 10px", borderRadius: "6px" }}>
          Provide all four nutrition values or leave all empty.
        </div>
      )}
      {error && <div style={{ color: "#dc3545", fontSize: "0.8rem", marginTop: "6px" }}>{error}</div>}
    </div>
  );
}
