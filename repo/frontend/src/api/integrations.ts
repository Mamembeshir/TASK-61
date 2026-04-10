/**
 * Integrations API client — alerts and webhook endpoints.
 */
import apiClient from "@/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AlertStatus   = "OPEN" | "ACKNOWLEDGED" | "ASSIGNED" | "CLOSED";

export interface AlertListItem {
  id: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  assigned_to_username: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  tenant_id: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  original_alert_id: string | null;
  acknowledged_by_id: string | null;
  acknowledged_by_username: string | null;
  acknowledged_at: string | null;
  assigned_to_id: string | null;
  assigned_to_username: string | null;
  closed_by_id: string | null;
  closed_by_username: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpoint {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  is_active: boolean;
  events: string[];
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  idempotency_key: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  attempt_number: number;
  response_status_code: number | null;
  response_body: string;
  sent_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const integrationsApi = {
  alerts: {
    list: (params?: { status?: string; severity?: string }): Promise<AlertListItem[]> =>
      apiClient.get("integrations/alerts/", { params }).then((r) => r.data),

    get: (id: string): Promise<Alert> =>
      apiClient.get(`integrations/alerts/${id}/`).then((r) => r.data),

    acknowledge: (id: string): Promise<Alert> =>
      apiClient.post(`integrations/alerts/${id}/acknowledge/`).then((r) => r.data),

    assign: (id: string, assigned_to: string): Promise<Alert> =>
      apiClient
        .post(`integrations/alerts/${id}/assign/`, { assigned_to })
        .then((r) => r.data),

    close: (id: string, resolution_note: string): Promise<Alert> =>
      apiClient
        .post(`integrations/alerts/${id}/close/`, { resolution_note })
        .then((r) => r.data),
  },

  webhooks: {
    list: (): Promise<WebhookEndpoint[]> =>
      apiClient.get("integrations/webhooks/").then((r) => r.data),

    create: (data: {
      url: string;
      secret: string;
      events: string[];
      is_active: boolean;
    }): Promise<WebhookEndpoint> =>
      apiClient.post("integrations/webhooks/", data).then((r) => r.data),

    get: (id: string): Promise<WebhookEndpoint> =>
      apiClient.get(`integrations/webhooks/${id}/`).then((r) => r.data),

    update: (
      id: string,
      data: Partial<Pick<WebhookEndpoint, "url" | "secret" | "events" | "is_active">>
    ): Promise<WebhookEndpoint> =>
      apiClient.patch(`integrations/webhooks/${id}/`, data).then((r) => r.data),

    delete: (id: string): Promise<void> =>
      apiClient.delete(`integrations/webhooks/${id}/`).then(() => undefined),

    deliveries: (id: string): Promise<WebhookDelivery[]> =>
      apiClient.get(`integrations/webhooks/${id}/deliveries/`).then((r) => r.data),
  },
};
