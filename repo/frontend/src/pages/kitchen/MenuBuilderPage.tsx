import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { menuApi, dishApi, type DishListItem } from "@/api/foodservice";
import TimePickerPair from "@/components/TimePickerPair";
import DishAutocomplete from "@/components/DishAutocomplete";

interface GroupItem {
  dish: DishListItem;
  dish_version_id: string | null; // null while loading active version
  sort_order: number;
}

interface Group {
  name: string;
  sort_order: number;
  availability_start: string;
  availability_end: string;
  items: GroupItem[];
  collapsed: boolean;
}

export default function MenuBuilderPage() {
  const navigate = useNavigate();

  const [menuName,    setMenuName]    = useState("");
  const [description, setDescription] = useState("");
  const [groups,      setGroups]      = useState<Group[]>([]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      { name: `Group ${prev.length + 1}`, sort_order: prev.length, availability_start: "", availability_end: "", items: [], collapsed: false },
    ]);
  }

  function removeGroup(i: number) {
    setGroups((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateGroup(i: number, field: keyof Omit<Group, "items" | "collapsed">, val: string | number) {
    setGroups((prev) => prev.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  }

  function toggleCollapse(i: number) {
    setGroups((prev) => prev.map((g, idx) => idx === i ? { ...g, collapsed: !g.collapsed } : g));
  }

  function addDishToGroup(groupIdx: number, dish: DishListItem) {
    setGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIdx) return g;
        if (g.items.find((it) => it.dish.id === dish.id)) return g; // dedupe
        return { ...g, items: [...g.items, { dish, dish_version_id: null, sort_order: g.items.length }] };
      })
    );
    // Fetch the active DishVersion ID asynchronously
    dishApi.get(dish.id).then((detail) => {
      const versionId = detail.active_version?.id ?? null;
      setGroups((prev) =>
        prev.map((g, idx) => {
          if (idx !== groupIdx) return g;
          return {
            ...g,
            items: g.items.map((it) =>
              it.dish.id === dish.id ? { ...it, dish_version_id: versionId } : it
            ),
          };
        })
      );
    });
  }

  function removeDishFromGroup(groupIdx: number, dishId: string) {
    setGroups((prev) =>
      prev.map((g, idx) =>
        idx !== groupIdx ? g : { ...g, items: g.items.filter((it) => it.dish.id !== dishId) }
      )
    );
  }

  function moveItem(groupIdx: number, itemIdx: number, dir: -1 | 1) {
    const j = itemIdx + dir;
    setGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIdx || j < 0 || j >= g.items.length) return g;
        const items = [...g.items];
        [items[itemIdx], items[j]] = [items[j], items[itemIdx]];
        return { ...g, items };
      })
    );
  }

  function timeError(g: Group): string {
    if (!g.availability_start && !g.availability_end) return "";
    if (g.availability_start && !g.availability_end) return "End time required when start is set.";
    if (!g.availability_start && g.availability_end) return "Start time required when end is set.";
    if (g.availability_start >= g.availability_end) return "Start must be before end.";
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!menuName.trim()) { setError("Menu name is required."); return; }
    for (const g of groups) {
      if (timeError(g)) { setError(`Group "${g.name}": ${timeError(g)}`); return; }
    }

    // Validate all dishes have resolved active version IDs
    for (const g of groups) {
      for (const it of g.items) {
        if (it.dish_version_id === null) {
          setError(`Dish "${it.dish.name}" has no active version and cannot be added to a menu.`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: menuName.trim(),
        description: description.trim(),
        groups: groups.map((g, gi) => ({
          name: g.name,
          sort_order: g.sort_order || gi,
          availability_start: g.availability_start || null,
          availability_end: g.availability_end || null,
          items: g.items.map((it, ii) => ({
            dish_version_id: it.dish_version_id!,
            sort_order: ii,
          })),
        })),
      };
      const menu = await menuApi.create(payload as any);
      navigate(`/kitchen/menus/${menu.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create menu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/menus")} style={backBtn}>← Menus</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>New Menu</h2>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Header */}
        <div style={section}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={labelStyle}>Menu Name <span style={req}>*</span></label>
              <input value={menuName} onChange={(e) => setMenuName(e.target.value)} style={input} placeholder="e.g. Summer Brunch" required />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...input, resize: "vertical", width: "100%", boxSizing: "border-box" }}
              placeholder="Brief description of this menu…"
            />
          </div>
        </div>

        {/* Groups */}
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Groups</h3>
          <button type="button" onClick={addGroup} style={outlineBtn}>+ Add Group</button>
        </div>

        {groups.length === 0 && (
          <div style={{ color: "#6c757d", fontSize: "0.9rem", marginBottom: "1rem" }}>
            No groups yet — add a group to start building the menu.
          </div>
        )}

        {groups.map((g, gi) => {
          const tErr = timeError(g);
          return (
            <div key={gi} style={{ ...section, marginBottom: "1rem" }}>
              {/* Group header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleCollapse(gi)}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "#6c757d" }}>{g.collapsed ? "▶" : "▼"}</span>
                  <input
                    value={g.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateGroup(gi, "name", e.target.value)}
                    style={{ border: "none", borderBottom: "1px solid #ced4da", fontSize: "1rem", fontWeight: 600, background: "transparent", outline: "none", padding: "2px 0" }}
                    placeholder="Group name"
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeGroup(gi); }} style={iconBtn}>Remove</button>
                </div>
              </div>

              {!g.collapsed && (
                <div style={{ marginTop: "1rem" }}>
                  {/* Availability */}
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={labelStyle}>Availability Window (optional)</label>
                    <TimePickerPair
                      startValue={g.availability_start}
                      endValue={g.availability_end}
                      onStartChange={(v) => updateGroup(gi, "availability_start", v)}
                      onEndChange={(v) => updateGroup(gi, "availability_end", v)}
                      error={tErr}
                    />
                  </div>

                  {/* Sort order */}
                  <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Sort Order:</label>
                    <input
                      type="number"
                      value={g.sort_order}
                      onChange={(e) => updateGroup(gi, "sort_order", parseInt(e.target.value) || 0)}
                      style={{ ...input, width: "80px" }}
                    />
                  </div>

                  {/* Dish items */}
                  <div>
                    <label style={labelStyle}>Dishes</label>
                    {g.items.length === 0 ? (
                      <p style={{ color: "#6c757d", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>No dishes added.</p>
                    ) : (
                      <div style={{ marginBottom: "0.75rem" }}>
                        {g.items.map((it, ii) => (
                          <div key={it.dish.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "8px 10px", border: "1px solid #dee2e6", borderRadius: "6px", marginBottom: "4px", background: "#fff" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <button type="button" onClick={() => moveItem(gi, ii, -1)} disabled={ii === 0} style={arrowBtn}>▲</button>
                              <button type="button" onClick={() => moveItem(gi, ii, 1)} disabled={ii === g.items.length - 1} style={arrowBtn}>▼</button>
                            </div>
                            <span style={{ flex: 1, fontSize: "0.9rem", fontWeight: 500 }}>{it.dish.name}</span>
                            {it.dish.per_serving_cost && (
                              <span style={{ color: "#6c757d", fontSize: "0.8rem" }}>${parseFloat(it.dish.per_serving_cost).toFixed(2)}</span>
                            )}
                            <button type="button" onClick={() => removeDishFromGroup(gi, it.dish.id)} style={{ ...iconBtn, color: "#dc3545", borderColor: "#dc3545" }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <GroupDishAdder onAdd={(dish) => addDishToGroup(gi, dish)} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? "Saving…" : "Save as Draft"}
        </button>
      </form>
    </div>
  );
}

function GroupDishAdder({ onAdd }: { onAdd: (d: DishListItem) => void }) {
  const [selected, setSelected] = useState<DishListItem | null>(null);

  function handleAdd() {
    if (!selected) return;
    onAdd(selected);
    setSelected(null);
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <DishAutocomplete value={selected} onChange={setSelected} placeholder="Search active dishes…" />
      </div>
      <button type="button" onClick={handleAdd} disabled={!selected} style={outlineBtn}>Add</button>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: "10px 20px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const outlineBtn: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const backBtn: React.CSSProperties    = { padding: "6px 12px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const iconBtn: React.CSSProperties    = { padding: "4px 10px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "4px", cursor: "pointer", fontSize: "0.82rem" };
const arrowBtn: React.CSSProperties   = { padding: "2px 5px", background: "#f8f9fa", border: "1px solid #ced4da", borderRadius: "3px", cursor: "pointer", fontSize: "0.65rem", lineHeight: 1 };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" };
const section: React.CSSProperties    = { padding: "1.25rem", border: "1px solid #dee2e6", borderRadius: "8px" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#495057", marginBottom: "4px" };
const req: React.CSSProperties        = { color: "#dc3545" };
const input: React.CSSProperties      = { display: "block", width: "100%", padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", boxSizing: "border-box" };
