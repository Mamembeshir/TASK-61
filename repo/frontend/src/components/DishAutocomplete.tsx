import { useState, useEffect, useRef } from "react";
import { dishApi, type DishListItem } from "@/api/foodservice";

interface Props {
  value: DishListItem | null;
  onChange: (dish: DishListItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Autocomplete that searches ACTIVE dish versions. */
export default function DishAutocomplete({ value, onChange, placeholder, disabled }: Props) {
  const [query,   setQuery]   = useState(value?.name ?? "");
  const [results, setResults] = useState<DishListItem[]>([]);
  const [open,    setOpen]    = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.name]);

  function handleInput(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      onChange(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const data = await dishApi.list({ search: q });
        // Only show dishes that have an active version (name != null)
        setResults(data.filter((d) => d.name));
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  }

  function select(dish: DishListItem) {
    onChange(dish);
    setQuery(dish.name ?? "");
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => query && setOpen(results.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search dishes…"}
        disabled={disabled}
        style={{
          padding: "6px 10px",
          border: "1px solid #ced4da",
          borderRadius: "6px",
          fontSize: "0.9rem",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
      {open && results.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 100,
            background: "#fff",
            border: "1px solid #ced4da",
            borderRadius: "6px",
            margin: 0,
            padding: "4px 0",
            listStyle: "none",
            width: "100%",
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}
        >
          {results.map((d) => (
            <li
              key={d.id}
              onMouseDown={() => select(d)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span style={{ fontWeight: 500 }}>{d.name}</span>
              {d.per_serving_cost && (
                <span style={{ color: "#6c757d", fontSize: "0.8rem", marginLeft: "8px" }}>
                  ${parseFloat(d.per_serving_cost).toFixed(2)} / serving
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
