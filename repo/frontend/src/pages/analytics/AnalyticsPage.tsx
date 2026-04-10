import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";
import { analyticsApi, type DashboardData } from "@/api/analytics";
import apiClient from "@/api/client";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  sub,
  color = "#1976d2",
}: {
  title: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderTop: `4px solid ${color}`,
        borderRadius: 6,
        padding: "1.25rem 1.5rem",
        minWidth: 150,
        flex: "1 1 150px",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          color: "#777",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "2rem", fontWeight: 700, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "#aaa", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "#444",
          marginBottom: "1rem",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFloat0(v: string | number | undefined): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function minsAgo(date: Date): string {
  const m = Math.round((Date.now() - date.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  return `${m} min ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { currentUser } = useAuth();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    analyticsApi
      .dashboard()
      .then((d) => {
        setData(d);
        // Most recent computed_at across all metric rows
        let latest: Date | null = null;
        for (const rows of Object.values(d.metrics)) {
          for (const row of rows) {
            const t = new Date(row.computed_at);
            if (!latest || t > latest) latest = t;
          }
        }
        setLastUpdated(latest);
      })
      .catch((err: Error) => setError(err.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const resp = await apiClient.get("analytics/export/", { responseType: "blob" });
      const url = URL.createObjectURL(resp.data as Blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = "analytics_export.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div style={{ padding: "2rem", fontFamily: "monospace" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "2rem", fontFamily: "monospace", color: "#d32f2f" }}>{error}</div>;
  if (!data)   return null;

  const m = data.metrics;

  // --- derive metric card values -------------------------------------------
  const funnelRows   = m["menu.funnel"]              ?? [];
  const utilRows     = m["asset.utilization_pct"]    ?? [];
  const taskCompRows = m["task.completion_rate_pct"] ?? [];
  const openAlertRows= m["alert.open_count"]         ?? [];
  const overdueRows  = m["task.overdue_count"]       ?? [];
  const mttrRows     = m["alert.mttr_minutes"]       ?? [];

  const totalMenus     = funnelRows.reduce((s, r) => s + parseFloat0(r.value), 0);
  const publishedCount = funnelRows.find((r) => String(r.dimensions.status) === "PUBLISHED");
  const menuConvPct    =
    totalMenus > 0
      ? Math.round((parseFloat0(publishedCount?.value) / totalMenus) * 100)
      : 0;

  const avgAssetUtil = utilRows.length
    ? Math.round(utilRows.reduce((s, r) => s + parseFloat0(r.value), 0) / utilRows.length)
    : 0;

  const avgTaskComp = taskCompRows.length
    ? Math.round(taskCompRows.reduce((s, r) => s + parseFloat0(r.value), 0) / taskCompRows.length)
    : 0;

  const openAlerts  = Math.round(openAlertRows.reduce((s, r) => s + parseFloat0(r.value), 0));
  const overdueTasks= Math.round(overdueRows.reduce((s, r) => s + parseFloat0(r.value), 0));
  const mttrValue   = mttrRows.length ? parseFloat0(mttrRows[0].value) : null;

  // --- chart data ----------------------------------------------------------
  const funnelChart = funnelRows.map((r) => ({
    status: String(r.dimensions.status ?? ""),
    count:  parseFloat0(r.value),
  }));

  const taskCompChart = taskCompRows.map((r) => ({
    site: String(r.dimensions.site_name ?? r.dimensions.site_id ?? "Global"),
    pct:  parseFloat0(r.value),
  }));

  const mttrChart = mttrRows.map((r) => ({
    period: r.period_start ? r.period_start.slice(0, 10) : "—",
    mttr:   parseFloat0(r.value),
  }));

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "monospace",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Analytics Dashboard</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {lastUpdated && (
            <span style={{ fontSize: "0.78rem", color: "#888" }}>
              Last updated: {minsAgo(lastUpdated)}
            </span>
          )}
          {currentUser?.role === "ADMIN" && (
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: "0.4rem 1rem",
                background: exporting ? "#aaa" : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: exporting ? "default" : "pointer",
                fontSize: "0.82rem",
              }}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "2rem",
        }}
      >
        <MetricCard
          title="Menu Conversion"
          value={`${menuConvPct}%`}
          sub="draft → published"
          color="#1976d2"
        />
        <MetricCard
          title="Asset Utilization"
          value={`${avgAssetUtil}%`}
          sub="avg across sites"
          color="#388e3c"
        />
        <MetricCard
          title="Task Completion"
          value={`${avgTaskComp}%`}
          sub="avg across sites"
          color="#7b1fa2"
        />
        <MetricCard
          title="Open Alerts"
          value={openAlerts}
          color={openAlerts > 0 ? "#d32f2f" : "#388e3c"}
        />
        <MetricCard
          title="Overdue Tasks"
          value={overdueTasks}
          color={overdueTasks > 0 ? "#f57c00" : "#388e3c"}
        />
        {mttrValue !== null && (
          <MetricCard
            title="Alert MTTR"
            value={`${Math.round(mttrValue)} min`}
            sub="mean time to resolve"
            color="#0288d1"
          />
        )}
      </div>

      {/* Charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {/* Menu Funnel */}
        {funnelChart.length > 0 && (
          <ChartCard title="Menu Funnel">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#1976d2" radius={[4, 4, 0, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Task Completion by Site */}
        {taskCompChart.length > 0 && (
          <ChartCard title="Task Completion % by Site">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={taskCompChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="site" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => [`${v ?? ""}%`, "Completion"]} />
                <Bar dataKey="pct" fill="#388e3c" radius={[4, 4, 0, 0]} name="Completion %" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Alert MTTR trend */}
        {mttrChart.length > 1 && (
          <ChartCard title="Alert MTTR Trend (minutes)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mttrChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" min" />
                <Tooltip formatter={(v) => [`${v ?? ""} min`, "MTTR"]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="mttr"
                  stroke="#0288d1"
                  strokeWidth={2}
                  dot={false}
                  name="MTTR (min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Empty state */}
      {funnelChart.length === 0 &&
        taskCompChart.length === 0 &&
        mttrChart.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#aaa",
              marginTop: "3rem",
              fontSize: "0.9rem",
            }}
          >
            No analytics data yet. Data is computed every 15 minutes.
          </div>
        )}
    </div>
  );
}
