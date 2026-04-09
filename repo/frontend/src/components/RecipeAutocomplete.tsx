import { useState, useRef } from "react";
import { recipeApi, type RecipeListItem } from "@/api/foodservice";

interface Props {
  value: RecipeListItem | null;
  onChange: (recipe: RecipeListItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Autocomplete for recipes (shows name + active cost). */
export default function RecipeAutocomplete({ value, onChange, placeholder, disabled }: Props) {
  const [query,   setQuery]   = useState(value?.name ?? "");
  const [results, setResults] = useState<RecipeListItem[]>([]);
  const [open,    setOpen]    = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const data = await recipeApi.list({ search: q });
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  }

  function select(recipe: RecipeListItem) {
    onChange(recipe);
    setQuery(recipe.name);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => query && setOpen(results.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? "Search recipes…"}
          disabled={disabled}
          style={{
            padding: "6px 10px",
            border: "1px solid #ced4da",
            borderRadius: "6px",
            fontSize: "0.9rem",
            flex: 1,
          }}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            style={{
              padding: "6px 10px",
              border: "1px solid #ced4da",
              borderRadius: "6px",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "#6c757d",
            }}
          >
            Clear
          </button>
        )}
      </div>
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
          {results.map((r) => (
            <li
              key={r.id}
              onMouseDown={() => select(r)}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.9rem" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              {r.per_serving_cost && (
                <span style={{ color: "#6c757d", fontSize: "0.8rem", marginLeft: "8px" }}>
                  ${parseFloat(r.per_serving_cost).toFixed(2)} / serving
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
