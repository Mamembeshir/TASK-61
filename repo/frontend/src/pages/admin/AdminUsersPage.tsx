import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus } from "lucide-react";
import { adminApi, type AdminUserSummary } from "@/api/admin";
import SearchInput from "@/components/SearchInput";
import {
  PageHeader, Button, Card, Table, Tr, Td, Badge, EmptyState,
  SkeletonTable, AlertBanner,
} from "@/components/ui";
import { selectStyle } from "@/styles/forms";
import { colors, font, userStatusColors, roleColors } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const cfg = userStatusColors[status] ?? { bg: colors.gray200, text: colors.gray700, label: status.replace("_", " ") };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} dot size="sm" />;
}

function RoleBadge({ role }: { role: string }) {
  const cfg = roleColors[role] ?? { bg: colors.gray100, text: colors.gray600 };
  return <Badge bg={cfg.bg} text={cfg.text} label={role} size="sm" />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",               label: "All Statuses"    },
  { value: "PENDING_REVIEW", label: "Pending Review"  },
  { value: "ACTIVE",         label: "Active"          },
  { value: "SUSPENDED",      label: "Suspended"       },
  { value: "DEACTIVATED",    label: "Deactivated"     },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "",        label: "All Roles" },
  { value: "ADMIN",   label: "Admin"     },
  { value: "STAFF",   label: "Staff"     },
  { value: "COURIER", label: "Courier"   },
];

export default function AdminUsersPage() {
  const navigate = useNavigate();

  const [users,      setUsers]      = useState<AdminUserSummary[]>([]);
  const [count,      setCount]      = useState(0);
  const [cursor,     setCursor]     = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [search,       setSearch]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listUsers({
        status: statusFilter || undefined,
        role:   roleFilter   || undefined,
        search: search       || undefined,
        cursor: cursor       || undefined,
      });
      setUsers(result.results);
      setCount(result.count);
      setNextCursor(result.next_cursor);
      setPrevCursor(result.previous_cursor);
    } catch (e: any) {
      setError(e.message ?? "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, search, cursor]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={count > 0 ? `${count.toLocaleString()} user${count === 1 ? "" : "s"} in directory` : "Manage staff, admins, and couriers"}
        icon={<Users size={22} />}
        actions={
          <Button
            variant="primary"
            onClick={() => navigate("/admin/users/create-courier")}
            icon={<Plus size={16} />}
          >
            Create Courier
          </Button>
        }
      />

      {/* Filters */}
      <Card padding="1rem 1.15rem" style={{ marginBottom: "1.15rem" }}>
        <div style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <div style={{ flex: "1 1 240px", minWidth: 220 }}>
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setCursor(null); }}
              placeholder="Search username…"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCursor(null); }}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setCursor(null); }}
            style={{ ...selectStyle, width: "auto", minWidth: 140 }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {(statusFilter || roleFilter || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter(""); setRoleFilter(""); setSearch(""); setCursor(null); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : users.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="👥"
            title="No users found"
            description={statusFilter || roleFilter || search
              ? "Try clearing the filters to see more users."
              : "Invite teammates to get started."}
          />
        </Card>
      ) : (
        <Table columns={["Name", "Username", "Role", "Status", "Sites", "Created"]}>
          {users.map((u) => (
            <Tr key={u.id} onClick={() => navigate(`/admin/users/${u.id}`)}>
              <Td style={{ fontWeight: font.weight.semibold, color: colors.text }}>
                {u.legal_name ?? "—"}
              </Td>
              <Td>
                <code style={{
                  fontFamily: font.familyMono,
                  fontSize: font.size.xs,
                  color: colors.textSecondary,
                }}>
                  {u.username}
                </code>
              </Td>
              <Td><RoleBadge role={u.role} /></Td>
              <Td><StatusBadge status={u.status} /></Td>
              <Td style={{ color: colors.textSecondary, fontSize: font.size.sm }}>
                {u.site_names.join(", ") || "—"}
              </Td>
              <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {new Date(u.created_at).toLocaleDateString()}
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {/* Pagination */}
      {(prevCursor || nextCursor) && (
        <div style={{
          marginTop: "1.15rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.6rem",
        }}>
          <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>
            {count.toLocaleString()} total
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" size="sm" disabled={!prevCursor} onClick={() => setCursor(prevCursor)}>
              ← Prev
            </Button>
            <Button variant="secondary" size="sm" disabled={!nextCursor} onClick={() => setCursor(nextCursor)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
