import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Plus } from "lucide-react";
import { meetingApi, type MeetingListItem, type MeetingStatus } from "@/api/meetings";
import { foodSiteApi, type FoodSite } from "@/api/foodservice";
import {
  PageHeader, Button, Card, Table, Tr, Td, Badge, EmptyState,
  SkeletonTable, AlertBanner, Modal, Field,
} from "@/components/ui";
import { inputStyle, selectStyle } from "@/styles/forms";
import { colors, font, meetingStatusColors } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const cfg = meetingStatusColors[status] ?? { bg: colors.gray200, text: colors.gray700, label: status };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} dot />;
}

// ---------------------------------------------------------------------------
// Create Meeting Modal
// ---------------------------------------------------------------------------
interface CreateModalProps {
  sites: FoodSite[];
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateMeetingModal({ sites, open, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle]             = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [siteId, setSiteId]           = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!scheduledAt)  { setError("Scheduled date/time is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await meetingApi.create({
        title: title.trim(),
        scheduled_at: scheduledAt,
        site_id: siteId || null,
      });
      // Reset and close
      setTitle("");
      setScheduledAt("");
      setSiteId("");
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Failed to create meeting.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Meeting"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Create Meeting
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Field label="Title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meeting title"
            style={inputStyle}
            autoFocus
          />
        </Field>
        <Field label="Scheduled At" required>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Site" hint="Optional — leave blank for a general meeting.">
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={selectStyle}>
            <option value="">— No site —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All Statuses" },
  { value: "DRAFT",       label: "Draft" },
  { value: "SCHEDULED",   label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED",   label: "Completed" },
  { value: "CANCELLED",   label: "Cancelled" },
];

export default function MeetingsPage() {
  const navigate = useNavigate();

  const [meetings,    setMeetings]    = useState<MeetingListItem[]>([]);
  const [sites,       setSites]       = useState<FoodSite[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter,  setSiteFilter]  = useState("");
  const [showCreate,  setShowCreate]  = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status   = statusFilter;
      if (siteFilter)   params.site_id  = siteFilter;
      const [ms, ss] = await Promise.all([
        meetingApi.list(params),
        sites.length === 0 ? foodSiteApi.list() : Promise.resolve(sites),
      ]);
      setMeetings(ms);
      if (sites.length === 0) setSites(ss as FoodSite[]);
    } catch (err: any) {
      setError(err.message ?? "Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }

  // Load sites once on mount
  useEffect(() => {
    foodSiteApi.list().then(setSites).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [statusFilter, siteFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated() {
    setShowCreate(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle={loading ? "Loading meetings…" : `${meetings.length} meeting${meetings.length === 1 ? "" : "s"} in view`}
        icon={<Calendar size={22} />}
        actions={
          <Button
            variant="primary"
            onClick={() => setShowCreate(true)}
            icon={<Plus size={16} />}
          >
            New Meeting
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            <option value="">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {(statusFilter || siteFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter(""); setSiteFilter(""); }}
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
      ) : meetings.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="📅"
            title="No meetings found"
            description={statusFilter || siteFilter
              ? "Try clearing the filters to see all meetings."
              : "Schedule your first meeting to start tracking agenda items, resolutions, and follow-up tasks."}
            action={
              <Button variant="primary" onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
                New Meeting
              </Button>
            }
          />
        </Card>
      ) : (
        <Table columns={["Title", "Scheduled At", "Site", "Status", "Resolutions", "Open Tasks"]}>
          {meetings.map((m) => (
            <Tr key={m.id} onClick={() => navigate(`/meetings/${m.id}`)}>
              <Td style={{ fontWeight: font.weight.semibold, color: colors.text }}>
                {m.title}
              </Td>
              <Td style={{ color: colors.textSecondary, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {fmtDateTime(m.scheduled_at)}
              </Td>
              <Td style={{ color: colors.textSecondary }}>{m.site_name ?? "—"}</Td>
              <Td><MeetingStatusBadge status={m.status} /></Td>
              <Td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", color: colors.textSecondary }}>
                {m.resolution_count}
              </Td>
              <Td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {m.open_task_count > 0 ? (
                  <Badge
                    bg={colors.dangerLight}
                    text={colors.dangerDark}
                    label={String(m.open_task_count)}
                    size="sm"
                  />
                ) : (
                  <span style={{ color: colors.textMuted }}>0</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <CreateMeetingModal
        open={showCreate}
        sites={sites}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
