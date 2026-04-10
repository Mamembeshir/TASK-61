import type { Classification } from "@/api/assets";
import { selectStyle } from "@/styles/forms";

interface Props {
  classifications: Classification[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/**
 * A <select> that renders classification nodes indented by level
 * (depth 1 = no indent, depth 2 = 2 spaces, depth 3 = 4 spaces).
 */
export default function TreeSelect({
  classifications,
  value,
  onChange,
  placeholder = "Select classification…",
  disabled = false,
  style,
}: Props) {
  // Flatten the tree into an ordered list for rendering
  const options = flattenTree(classifications);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        ...selectStyle,
        width: "auto",
        minWidth: 200,
        ...style,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {"\u00A0".repeat((opt.level - 1) * 3)}{opt.level > 1 ? "└ " : ""}{opt.code} — {opt.name}
        </option>
      ))}
    </select>
  );
}

interface FlatOption {
  id: string;
  code: string;
  name: string;
  level: number;
}

function flattenTree(nodes: Classification[], result: FlatOption[] = []): FlatOption[] {
  for (const node of nodes) {
    result.push({ id: node.id, code: node.code, name: node.name, level: node.level });
    if (node.children?.length) {
      flattenTree(node.children, result);
    }
  }
  return result;
}
