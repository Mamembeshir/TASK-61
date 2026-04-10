/**
 * Analytics API client.
 */
import apiClient from "@/api/client";

export interface AnalyticsSummary {
  id: string;
  metric_name: string;
  dimensions: Record<string, unknown>;
  value: string;
  period_start: string;
  period_end: string;
  computed_at: string;
}

export interface DashboardData {
  metrics: Record<string, AnalyticsSummary[]>;
}

export const analyticsApi = {
  dashboard: (): Promise<DashboardData> =>
    apiClient.get("analytics/dashboard/").then((r) => r.data),

  exportCsv: () =>
    apiClient.get("analytics/export/", { responseType: "blob" }),
};
