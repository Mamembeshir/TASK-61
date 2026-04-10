import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  meetingApi,
  type MeetingDetail,
  type MeetingStatus,
  type AgendaItem,
  type Attendance,
  type AttendanceMethod,
  type MeetingResolution,
  type MeetingTask,
  type TaskStatus,
  type DeliveryType,
} from "@/api/meetings";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/api/client";

// ---------------------------------------------------------------------------
// Status badge (meeting-scoped)
// ---------------------------------------------------------------------------
function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const cfg: Record<MeetingStatus, { bg: string; color: string; label: string }> = {
    DRAFT:       { bg: "#e2e3e5", color: "#41464b", label: "Draft" },
    SCHEDULED:   { bg: "#cfe2ff", color: "#084298", label: "Scheduled" },
    IN_PROGRESS: { bg: "#fff3cd", color: "#856404", label: "In Progress" },
    COMPLETED:   { bg: "#d1e7dd", color: "#0f5132", label: "Completed" },
    CANCELLED:   { bg: "#f8d7da", color: "#842029", label: "Cancelled" },
  };
  const c = cfg[status] ?? { bg: "#e2e3e5", color: "#41464b", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      fontSize: "0.75rem", fontWeight: 600, background: c.bg, color: c.color,
      letterSpacing: "0.03em",
    }}>
      {c.label}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg: Record<TaskStatus, { bg: string; color: string; label: string }> = {
    TODO:        { bg: "#e2e3e5", color: "#41464b", label: "To Do" },
    IN_PROGRESS: { bg: "#cfe2ff", color: "#084298", label: "In Progress" },
    DONE:        { bg: "#d1e7dd", color: "#0f5132", label: "Done" },
    OVERDUE:     { bg: "#f8d7da", color: "#842029", label: "Overdue" },
    CANCELLED:   { bg: "#f0f0f0", color: "#6c757d", label: "Cancelled" },
  };
  const c = cfg[status] ?? { bg: "#e2e3e5", color: "#41464b", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "10px",
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

function ResolutionStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    OPEN:        { bg: "#fff3cd", color: "#856404", label: "Open" },
    IN_PROGRESS: { bg: "#cfe2ff", color: "#084298", label: "In Progress" },
    COMPLETED:   { bg: "#d1e7dd", color: "#0f5132", label: "Completed" },
    CANCELLED:   { bg: "#f8d7da", color: "#842029", label: "Cancelled" },
  };
  const c = cfg[status] ?? { bg: "#e2e3e5", color: "#41464b", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "10px",
      fontSize: "0.72rem", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------
function ConfirmModal({
  title, message, confirmLabel, danger,
  onConfirm, onCancel, loading,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem" }}>{title}</h3>
        <p style={{ color: "#495057", fontSize: "0.9rem", margin: "0 0 1.25rem" }}>{message}</p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={outlineBtn} disabled={loading}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={danger ? dangerBtn : primaryBtn}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 1: Agenda
// ---------------------------------------------------------------------------
function AgendaTab({ meeting, onReload }: { meeting: MeetingDetail; onReload: () => void }) {
  const canEdit = meeting.status === "DRAFT" || meeting.status === "SCHEDULED";

  const [agendaTitle, setAgendaTitle]   = useState("");
  const [agendaDesc,  setAgendaDesc]    = useState("");
  const [agendaFile,  setAgendaFile]    = useState<File | null>(null);
  const [submitting,  setSubmitting]    = useState(false);
  const [formError,   setFormError]     = useState<string | null>(null);
  const [deleting,    setDeleting]      = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!agendaTitle.trim()) { setFormError("Title is required."); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.append("title", agendaTitle.trim());
      fd.append("description", agendaDesc.trim());
      if (agendaFile) fd.append("file", agendaFile);
      await meetingApi.agenda.create(meeting.id, fd);
      setAgendaTitle("");
      setAgendaDesc("");
      setAgendaFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onReload();
    } catch (err: any) {
      setFormError(err.message ?? "Failed to add agenda item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(itemId: string) {
    if (!window.confirm("Remove this agenda item?")) return;
    setDeleting(itemId);
    try {
      await meetingApi.agenda.delete(meeting.id, itemId);
      onReload();
    } catch (err: any) {
      alert(err.message ?? "Failed to delete item.");
    } finally {
      setDeleting(null);
    }
  }

  const items = meeting.agenda_items ?? [];

  return (
    <div>
      {!canEdit && (
        <div style={{ background: "#fff3cd", color: "#856404", padding: "10px 16px", borderRadius: "6px", marginBottom: "1.25rem", fontSize: "0.87rem", fontWeight: 500 }}>
          Agenda is frozen — no changes allowed.
        </div>
      )}

      {canEdit && (
        <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem" }}>
          <h4 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Add Agenda Item</h4>
          <form onSubmit={handleAddItem}>
            <div style={fieldGroup}>
              <label style={labelStyle}>Title <span style={{ color: "#dc3545" }}>*</span></label>
              <input
                type="text"
                value={agendaTitle}
                onChange={(e) => setAgendaTitle(e.target.value)}
                placeholder="Item title"
                style={inputStyle}
              />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={agendaDesc}
                onChange={(e) => setAgendaDesc(e.target.value)}
                placeholder="Optional description"
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>Attachment (optional)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                onChange={(e) => setAgendaFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            {formError && (
              <div style={errorBox}>{formError}</div>
            )}
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? "Adding…" : "Add Item"}
            </button>
          </form>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: "#6c757d", fontStyle: "italic" }}>No agenda items yet.</p>
      ) : (
        <div>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem",
              marginBottom: "0.75rem", background: "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <span style={{ fontWeight: 600, color: "#6c757d", minWidth: "24px", fontSize: "0.85rem", marginTop: "2px" }}>
                  {idx + 1}.
                </span>
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>{item.title}</div>
                  {item.description && (
                    <div style={{ color: "#495057", fontSize: "0.87rem", marginBottom: "6px", whiteSpace: "pre-wrap" }}>
                      {item.description}
                    </div>
                  )}
                  <div style={{ fontSize: "0.8rem", color: "#6c757d" }}>
                    Submitted by: {item.submitted_by_username}
                    {item.attachment_path && (
                      <> &middot; <a
                        href={`/media/${item.attachment_path}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#0d6efd" }}
                      >Download attachment</a></>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    style={{ padding: "4px 10px", background: "#fff", color: "#dc3545", border: "1px solid #dc3545", borderRadius: "5px", cursor: "pointer", fontSize: "0.78rem", whiteSpace: "nowrap" }}
                  >
                    {deleting === item.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 2: Attendance
// ---------------------------------------------------------------------------
function AttendanceTab({ meeting, onReload }: { meeting: MeetingDetail; onReload: () => void }) {
  const { currentUser } = useAuth();
  const canSignIn = meeting.status === "SCHEDULED" || meeting.status === "IN_PROGRESS";
  const attendances: Attendance[] = meeting.attendances ?? [];
  const myAttendance = attendances.find((a) => a.user_id === currentUser?.id);

  const [method,      setMethod]      = useState<AttendanceMethod>("IN_PERSON");
  const [showForm,    setShowForm]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!currentUser) return;
    setSubmitting(true);
    setSignInError(null);
    try {
      await meetingApi.attendance.signIn(meeting.id, { user_id: currentUser.id, method });
      setShowForm(false);
      onReload();
    } catch (err: any) {
      setSignInError(err.message ?? "Failed to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  function MethodBadge({ m }: { m: AttendanceMethod }) {
    return (
      <span style={{
        display: "inline-block", padding: "2px 8px", borderRadius: "10px",
        fontSize: "0.72rem", fontWeight: 600,
        background: m === "IN_PERSON" ? "#cfe2ff" : "#e2e3e5",
        color: m === "IN_PERSON" ? "#084298" : "#41464b",
      }}>
        {m === "IN_PERSON" ? "In Person" : "Material Only"}
      </span>
    );
  }

  return (
    <div>
      {/* Sign-in section */}
      {canSignIn && (
        <div style={{ marginBottom: "1.5rem" }}>
          {myAttendance ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#d1e7dd", color: "#0f5132", padding: "8px 14px", borderRadius: "6px", fontWeight: 500, fontSize: "0.87rem" }}>
              <span>You are signed in</span>
              <MethodBadge m={myAttendance.method} />
            </div>
          ) : (
            <>
              {!showForm ? (
                <button onClick={() => setShowForm(true)} style={primaryBtn}>Sign In</button>
              ) : (
                <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem", maxWidth: "360px" }}>
                  <div style={fieldGroup}>
                    <label style={labelStyle}>Attendance Method</label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as AttendanceMethod)}
                      style={inputStyle}
                    >
                      <option value="IN_PERSON">In Person</option>
                      <option value="MATERIAL_ONLY">Material Only</option>
                    </select>
                  </div>
                  {signInError && <div style={errorBox}>{signInError}</div>}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={handleSignIn} disabled={submitting} style={primaryBtn}>
                      {submitting ? "Signing in…" : "Confirm"}
                    </button>
                    <button onClick={() => setShowForm(false)} style={outlineBtn}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Roster table */}
      {attendances.length === 0 ? (
        <p style={{ color: "#6c757d", fontStyle: "italic" }}>No attendance records yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6" }}>
              <th style={th}>Name</th>
              <th style={th}>Method</th>
              <th style={th}>Signed At</th>
            </tr>
          </thead>
          <tbody>
            {attendances.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                <td style={td}>
                  {a.user_username}
                  {a.user_id === currentUser?.id && (
                    <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "#0d6efd", fontWeight: 500 }}>(you)</span>
                  )}
                </td>
                <td style={td}><MethodBadge m={a.method} /></td>
                <td style={{ ...td, color: "#6c757d" }}>{fmtDateTime(a.signed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3: Minutes
// ---------------------------------------------------------------------------
function MinutesTab({ meeting }: { meeting: MeetingDetail }) {
  const isReadOnly = meeting.status === "COMPLETED" || meeting.status === "CANCELLED";

  const [content,    setContent]    = useState("");
  const [loadState,  setLoadState]  = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    meetingApi.minutes.get(meeting.id)
      .then((m) => {
        setContent(m?.content ?? "");
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [meeting.id]);

  async function doSave(text: string) {
    setSaveStatus("saving");
    try {
      await meetingApi.minutes.save(meeting.id, text);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  function handleChange(val: string) {
    setContent(val);
    if (isReadOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(val), 3000);
  }

  if (loadState === "loading") return <div style={{ color: "#6c757d" }}>Loading minutes…</div>;
  if (loadState === "error")   return <div style={{ color: "#dc3545" }}>Failed to load minutes.</div>;

  const charCount = content.length;

  return (
    <div>
      <div style={{ position: "relative", marginBottom: "0.5rem" }}>
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={isReadOnly}
          placeholder={isReadOnly ? "" : "Enter meeting minutes…"}
          maxLength={50000}
          style={{
            width: "100%", minHeight: "400px", padding: "12px", resize: "vertical",
            border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem",
            fontFamily: "inherit", boxSizing: "border-box",
            background: isReadOnly ? "#f8f9fa" : "#fff",
            color: isReadOnly ? "#495057" : "#212529",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.83rem", color: "#6c757d" }}>
        <span>{charCount.toLocaleString()} / 50,000 characters</span>
        {!isReadOnly && (
          <>
            {saveStatus === "saving" && <span style={{ color: "#0d6efd" }}>Saving…</span>}
            {saveStatus === "saved"  && <span style={{ color: "#198754" }}>Saved ✓</span>}
            {saveStatus === "error"  && <span style={{ color: "#dc3545" }}>Save failed</span>}
            <button
              onClick={() => doSave(content)}
              disabled={saveStatus === "saving"}
              style={{ ...primaryBtn, marginLeft: "auto" }}
            >
              Save
            </button>
          </>
        )}
        {isReadOnly && (
          <span style={{ fontStyle: "italic" }}>Read-only</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User search for task creation
// ---------------------------------------------------------------------------
interface UserOption { id: string; username: string; role: string; }

function UserSearchInput({
  value, onChange,
}: { value: string; onChange: (id: string, username: string) => void }) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<UserOption[]>([]);
  const [open,      setOpen]      = useState(false);
  const [selected,  setSelected]  = useState(value ? { id: value, username: "" } : null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(q: string) {
    if (debRef.current) clearTimeout(debRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        const r = await apiClient.get("admin/users/", { params: { search: q } });
        const data: UserOption[] = Array.isArray(r.data) ? r.data : (r.data.results ?? []);
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  }

  function handleSelect(u: UserOption) {
    setSelected(u);
    setQuery(u.username);
    setOpen(false);
    onChange(u.id, u.username);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={selected ? selected.username || query : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          onChange("", "");
          search(e.target.value);
        }}
        placeholder="Search username…"
        style={inputStyle}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: "1px solid #ced4da", borderRadius: "6px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: "180px", overflowY: "auto",
        }}>
          {results.map((u) => (
            <div
              key={u.id}
              onMouseDown={() => handleSelect(u)}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.87rem", borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {u.username} <span style={{ color: "#6c757d", fontSize: "0.78rem" }}>({u.role})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 4: Resolutions & Tasks
// ---------------------------------------------------------------------------
function TaskRow({
  task, onUpdated,
}: { task: MeetingTask; onUpdated: () => void }) {
  const [noteText,     setNoteText]     = useState("");
  const [savingNote,   setSavingNote]   = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleStatusChange(newStatus: TaskStatus) {
    setUpdatingStatus(true);
    try {
      await meetingApi.tasks.update(task.id, { status: newStatus });
      onUpdated();
    } catch (err: any) {
      alert(err.message ?? "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await meetingApi.tasks.update(task.id, { progress_notes: noteText.trim() });
      setNoteText("");
      onUpdated();
    } catch (err: any) {
      alert(err.message ?? "Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  }

  const isOverdue = task.status === "OVERDUE";

  return (
    <tr style={{ borderBottom: "1px solid #dee2e6", background: isOverdue ? "#fff5f5" : undefined }}>
      <td style={{ ...td, paddingLeft: "2rem" }}>{task.title}</td>
      <td style={td}>{task.assignee_username}</td>
      <td style={{ ...td, color: "#6c757d" }}>{task.due_date ? fmtDate(task.due_date) : "—"}</td>
      <td style={td}><TaskStatusBadge status={task.status} /></td>
      <td style={td}>
        {task.allowed_transitions.length > 0 ? (
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            disabled={updatingStatus}
            style={{ padding: "4px 8px", border: "1px solid #ced4da", borderRadius: "5px", fontSize: "0.82rem" }}
          >
            <option value={task.status} disabled>{task.status}</option>
            {task.allowed_transitions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: "#adb5bd", fontSize: "0.82rem" }}>—</span>
        )}
      </td>
      <td style={td}>
        <div style={{ fontSize: "0.82rem", color: "#495057", marginBottom: "4px" }}>
          {task.progress_notes ? (
            <span title={task.progress_notes}>
              {task.progress_notes.length > 60 ? task.progress_notes.slice(0, 60) + "…" : task.progress_notes}
            </span>
          ) : (
            <span style={{ color: "#adb5bd" }}>No notes</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add note…"
            style={{ padding: "3px 6px", border: "1px solid #ced4da", borderRadius: "4px", fontSize: "0.8rem", flexGrow: 1, minWidth: "80px" }}
          />
          <button
            onClick={handleSaveNote}
            disabled={savingNote || !noteText.trim()}
            style={{ padding: "3px 8px", background: "#198754", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.78rem" }}
          >
            {savingNote ? "…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}

interface AddTaskFormProps {
  resolution: MeetingResolution;
  agendaItems: AgendaItem[];
  onCreated: () => void;
  onCancel: () => void;
}

function AddTaskForm({ resolution, agendaItems: _ai, onCreated, onCancel }: AddTaskFormProps) {
  const [title,          setTitle]          = useState("");
  const [assigneeId,     setAssigneeId]     = useState("");
  const [dueDate,        setDueDate]        = useState("");
  const [deliveryType,   setDeliveryType]   = useState<DeliveryType | "">("");
  const [pickupLoc,      setPickupLoc]      = useState("");
  const [dropLoc,        setDropLoc]        = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim())  { setError("Title is required."); return; }
    if (!assigneeId)    { setError("Assignee is required."); return; }
    if (!dueDate)       { setError("Due date is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await meetingApi.tasks.create(resolution.id, {
        title: title.trim(),
        assignee_id: assigneeId,
        due_date: dueDate,
        delivery_type:   deliveryType || null,
        pickup_location: deliveryType === "PICKUP" ? pickupLoc || null : null,
        drop_location:   deliveryType === "DROP"   ? dropLoc   || null : null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem", marginTop: "0.75rem" }}>
      <h5 style={{ margin: "0 0 0.75rem", fontSize: "0.88rem", fontWeight: 600 }}>Add Task</h5>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Title <span style={{ color: "#dc3545" }}>*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Assignee <span style={{ color: "#dc3545" }}>*</span></label>
            <UserSearchInput value={assigneeId} onChange={(id) => setAssigneeId(id)} />
          </div>
          <div>
            <label style={labelStyle}>Due Date <span style={{ color: "#dc3545" }}>*</span></label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Delivery Type (optional)</label>
            <select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value as DeliveryType | "")} style={inputStyle}>
              <option value="">None</option>
              <option value="PICKUP">Pickup</option>
              <option value="DROP">Drop</option>
            </select>
          </div>
          {deliveryType === "PICKUP" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Pickup Location</label>
              <input type="text" value={pickupLoc} onChange={(e) => setPickupLoc(e.target.value)} style={inputStyle} />
            </div>
          )}
          {deliveryType === "DROP" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Drop Location</label>
              <input type="text" value={dropLoc} onChange={(e) => setDropLoc(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>
        {error && <div style={errorBox}>{error}</div>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={submitting} style={primaryBtn}>
            {submitting ? "Creating…" : "Create Task"}
          </button>
          <button type="button" onClick={onCancel} style={outlineBtn}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

interface ResolutionCardProps {
  resolution: MeetingResolution;
  agendaItems: AgendaItem[];
  canEdit: boolean;
  onReload: () => void;
}

function ResolutionCard({ resolution, agendaItems, canEdit, onReload }: ResolutionCardProps) {
  const [showAddTask, setShowAddTask] = useState(false);
  const linkedItem = agendaItems.find((a) => a.id === resolution.agenda_item_id);

  return (
    <div style={{ border: "1px solid #dee2e6", borderRadius: "8px", marginBottom: "1rem", overflow: "hidden" }}>
      {/* Resolution header */}
      <div style={{ padding: "1rem", background: "#f8f9fa", borderBottom: "1px solid #dee2e6" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: "4px", fontSize: "0.92rem" }}>{resolution.text}</div>
            <div style={{ fontSize: "0.78rem", color: "#6c757d", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {linkedItem && <span>Agenda: {linkedItem.title}</span>}
              <span>Created: {fmtDate(resolution.created_at)}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ResolutionStatusBadge status={resolution.status} />
            {canEdit && (
              <button
                onClick={() => setShowAddTask((v) => !v)}
                style={{ padding: "4px 10px", background: "#198754", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "0.78rem" }}
              >
                {showAddTask ? "Cancel" : "+ Add Task"}
              </button>
            )}
          </div>
        </div>
        {showAddTask && canEdit && (
          <AddTaskForm
            resolution={resolution}
            agendaItems={agendaItems}
            onCreated={() => { setShowAddTask(false); onReload(); }}
            onCancel={() => setShowAddTask(false)}
          />
        )}
      </div>

      {/* Tasks */}
      {resolution.tasks.length === 0 ? (
        <div style={{ padding: "0.75rem 1rem", color: "#6c757d", fontSize: "0.85rem", fontStyle: "italic" }}>No tasks yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #dee2e6", background: "#fafafa" }}>
                <th style={{ ...th, paddingLeft: "2rem" }}>Task</th>
                <th style={th}>Assignee</th>
                <th style={th}>Due Date</th>
                <th style={th}>Status</th>
                <th style={th}>Update Status</th>
                <th style={th}>Progress Notes</th>
              </tr>
            </thead>
            <tbody>
              {resolution.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onUpdated={onReload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResolutionsTab({ meeting, onReload }: { meeting: MeetingDetail; onReload: () => void }) {
  const canEdit    = meeting.status === "IN_PROGRESS" || meeting.status === "COMPLETED";
  const resolutions: MeetingResolution[] = meeting.resolutions ?? [];
  const agendaItems: AgendaItem[]        = meeting.agenda_items ?? [];

  const [showNewForm,  setShowNewForm]  = useState(false);
  const [resText,      setResText]      = useState("");
  const [resAgendaId,  setResAgendaId]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  async function handleCreateResolution(e: React.FormEvent) {
    e.preventDefault();
    if (!resText.trim()) { setFormError("Resolution text is required."); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      await meetingApi.resolutions.create(meeting.id, {
        text: resText.trim(),
        agenda_item_id: resAgendaId || null,
      });
      setResText("");
      setResAgendaId("");
      setShowNewForm(false);
      onReload();
    } catch (err: any) {
      setFormError(err.message ?? "Failed to create resolution.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {canEdit && (
        <div style={{ marginBottom: "1.25rem" }}>
          {!showNewForm ? (
            <button onClick={() => setShowNewForm(true)} style={primaryBtn}>+ New Resolution</button>
          ) : (
            <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem" }}>
              <h4 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>New Resolution</h4>
              <form onSubmit={handleCreateResolution}>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Resolution Text <span style={{ color: "#dc3545" }}>*</span></label>
                  <textarea
                    value={resText}
                    onChange={(e) => setResText(e.target.value)}
                    placeholder="Describe the resolution…"
                    style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  />
                </div>
                <div style={fieldGroup}>
                  <label style={labelStyle}>Linked Agenda Item (optional)</label>
                  <select value={resAgendaId} onChange={(e) => setResAgendaId(e.target.value)} style={inputStyle}>
                    <option value="">— None —</option>
                    {agendaItems.map((a) => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </div>
                {formError && <div style={errorBox}>{formError}</div>}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" disabled={submitting} style={primaryBtn}>
                    {submitting ? "Saving…" : "Save Resolution"}
                  </button>
                  <button type="button" onClick={() => setShowNewForm(false)} style={outlineBtn}>Cancel</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {resolutions.length === 0 ? (
        <p style={{ color: "#6c757d", fontStyle: "italic" }}>No resolutions yet.</p>
      ) : (
        resolutions.map((r) => (
          <ResolutionCard
            key={r.id}
            resolution={r}
            agendaItems={agendaItems}
            canEdit={canEdit}
            onReload={onReload}
          />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
type Tab = "agenda" | "attendance" | "minutes" | "resolutions";

type ConfirmAction = "schedule" | "start" | "complete" | "cancel" | null;

export default function MeetingDetailPage() {
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();

  const [meeting,      setMeeting]      = useState<MeetingDetail | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [tab,          setTab]          = useState<Tab>("agenda");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const m = await meetingApi.get(id);
      setMeeting(m);
    } catch (err: any) {
      setError(err.message ?? "Meeting not found.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(action: ConfirmAction) {
    if (!id || !action) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fn = {
        schedule: meetingApi.schedule,
        start:    meetingApi.start,
        complete: meetingApi.complete,
        cancel:   meetingApi.cancel,
      }[action];
      const updated = await fn(id);
      setMeeting(updated);
      setConfirmAction(null);
    } catch (err: any) {
      setActionError(err.message ?? "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "1.5rem", color: "#6c757d" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "1.5rem", color: "#842029" }}>{error}</div>;
  if (!meeting) return null;

  const status        = meeting.status;
  const hasAgenda     = (meeting.agenda_items ?? []).length > 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "agenda",       label: "Agenda" },
    { key: "attendance",   label: "Attendance" },
    { key: "minutes",      label: "Minutes" },
    { key: "resolutions",  label: "Resolutions & Tasks" },
  ];

  const confirmMeta: Record<
    NonNullable<ConfirmAction>,
    { title: string; message: string; confirmLabel: string; danger?: boolean }
  > = {
    schedule: {
      title: "Schedule Meeting?",
      message: "This will mark the meeting as Scheduled and lock the agenda.",
      confirmLabel: "Schedule",
    },
    start: {
      title: "Start Meeting?",
      message: "This will set the meeting to In Progress. Attendance recording will begin.",
      confirmLabel: "Start Meeting",
    },
    complete: {
      title: "Complete Meeting?",
      message: "This will mark the meeting as Completed. Minutes and resolutions will be read-only.",
      confirmLabel: "Complete",
    },
    cancel: {
      title: "Cancel Meeting?",
      message: "This will cancel the meeting. This action cannot be undone.",
      confirmLabel: "Cancel Meeting",
      danger: true,
    },
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate("/meetings")} style={backBtn}>← Meetings</button>
        <div style={{ flexGrow: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700 }}>{meeting.title}</h2>
            <MeetingStatusBadge status={status} />
          </div>
          {meeting.scheduled_at && (
            <div style={{ fontSize: "0.83rem", color: "#6c757d", marginTop: "4px" }}>
              Scheduled: {fmtDateTime(meeting.scheduled_at)}
              {meeting.site_name && ` · ${meeting.site_name}`}
            </div>
          )}
          {actionError && (
            <div style={{ ...errorBox, marginTop: "0.5rem", display: "inline-block" }}>{actionError}</div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {status === "DRAFT" && hasAgenda && (
            <button onClick={() => setConfirmAction("schedule")} style={successBtn}>Schedule</button>
          )}
          {status === "SCHEDULED" && (
            <button onClick={() => setConfirmAction("start")} style={successBtn}>Start</button>
          )}
          {status === "IN_PROGRESS" && (
            <button onClick={() => setConfirmAction("complete")} style={successBtn}>Complete</button>
          )}
          {(status === "SCHEDULED" || status === "IN_PROGRESS") && (
            <button onClick={() => setConfirmAction("cancel")} style={dangerBtn}>Cancel</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #dee2e6", marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 18px", border: "none", background: "transparent", cursor: "pointer",
              fontWeight: tab === t.key ? 700 : 400,
              borderBottom: tab === t.key ? "2px solid #0d6efd" : "2px solid transparent",
              marginBottom: "-2px",
              color: tab === t.key ? "#0d6efd" : "#495057",
              fontSize: "0.9rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "agenda"      && <AgendaTab      meeting={meeting} onReload={load} />}
      {tab === "attendance"  && <AttendanceTab  meeting={meeting} onReload={load} />}
      {tab === "minutes"     && <MinutesTab     meeting={meeting} />}
      {tab === "resolutions" && <ResolutionsTab meeting={meeting} onReload={load} />}

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          {...confirmMeta[confirmAction]}
          loading={actionLoading}
          onConfirm={() => handleAction(confirmAction)}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
        />
      )}
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
  } catch { return iso; }
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const primaryBtn: React.CSSProperties = {
  padding: "8px 16px", background: "#0d6efd", color: "#fff",
  border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem",
};
const outlineBtn: React.CSSProperties = {
  padding: "7px 14px", background: "#fff", color: "#0d6efd",
  border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem",
};
const successBtn: React.CSSProperties = {
  padding: "8px 16px", background: "#198754", color: "#fff",
  border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem",
};
const dangerBtn: React.CSSProperties = {
  padding: "8px 16px", background: "#dc3545", color: "#fff",
  border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem",
};
const backBtn: React.CSSProperties = {
  padding: "6px 12px", background: "#fff", color: "#6c757d",
  border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem",
  whiteSpace: "nowrap",
};
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
};
const modalBox: React.CSSProperties = {
  background: "#fff", borderRadius: "10px", padding: "1.5rem",
  maxWidth: "460px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};
const fieldGroup: React.CSSProperties  = { marginBottom: "0.9rem" };
const labelStyle: React.CSSProperties  = { display: "block", fontWeight: 500, fontSize: "0.82rem", marginBottom: "4px", color: "#212529" };
const inputStyle: React.CSSProperties  = { width: "100%", padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.88rem", boxSizing: "border-box" };
const errorBox: React.CSSProperties    = { background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px", marginBottom: "0.75rem", fontSize: "0.83rem" };
const th: React.CSSProperties          = { padding: "8px 14px", fontWeight: 600, fontSize: "0.75rem", color: "#495057", textTransform: "uppercase", textAlign: "left" };
const td: React.CSSProperties          = { padding: "8px 14px", verticalAlign: "middle" };
