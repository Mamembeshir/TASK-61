import React from "react";

interface Step {
  label: string;
}

interface Props {
  steps: Step[];
  currentStep: number;   // 0-indexed
  children: React.ReactNode;
}

/**
 * Generic multi-step wizard container.
 * Renders a step indicator at the top and the current step's content below.
 */
export default function StepWizard({ steps, currentStep, children }: Props) {
  return (
    <div>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "0" }}>
        {steps.map((step, idx) => {
          const done    = idx < currentStep;
          const active  = idx === currentStep;
          const dotBg   = done ? "#198754" : active ? "#0d6efd" : "#dee2e6";
          const dotColor = done || active ? "#fff" : "#6c757d";
          const labelColor = active ? "#212529" : done ? "#198754" : "#6c757d";

          return (
            <React.Fragment key={idx}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "64px" }}>
                <div style={{
                  width: "30px", height: "30px",
                  borderRadius: "50%",
                  background: dotBg,
                  color: dotColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: "0.85rem",
                }}>
                  {done ? "✓" : idx + 1}
                </div>
                <div style={{ fontSize: "0.75rem", marginTop: "4px", color: labelColor, fontWeight: active ? 600 : 400, textAlign: "center" }}>
                  {step.label}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div style={{
                  flex: 1, height: "2px",
                  background: done ? "#198754" : "#dee2e6",
                  marginBottom: "20px",
                  minWidth: "16px",
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current step content */}
      <div>{children}</div>
    </div>
  );
}
