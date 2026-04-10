/**
 * Admin user-management API client.
 * All endpoints require ADMIN role + ACTIVE status (enforced by backend).
 */
import apiClient from "./client";

export interface AdminUserSummary {
  id: string;
  username: string;
  legal_name: string | null;
  role: string;
  status: string;
  created_at: string;
  site_names: string[];
}

export interface StatusHistoryEntry {
  id: string;
  old_status: string;
  new_status: string;
  changed_by_username: string | null;
  reason: string;
  timestamp: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  status_history: StatusHistoryEntry[];
  photo_id_review_status: string | null;
  photo_id_file_path: string | null;
  failed_login_count: number;
  locked_until: string | null;
  is_locked: boolean;
  employee_student_id: string | null;
}

export interface Site {
  id: string;
  name: string;
  timezone: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantSite {
  id: string;
  tenant: string;
  name: string;
  address: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedUsers {
  count: number;
  next_cursor: string | null;
  previous_cursor: string | null;
  results: AdminUserSummary[];
}

export const adminApi = {
  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  async listUsers(params?: {
    status?: string;
    role?: string;
    search?: string;
    cursor?: string;
  }): Promise<PaginatedUsers> {
    // The client interceptor unwraps paginated responses to a plain array on
    // `response.data` and preserves the wrapper on `response.pagination`.
    const response = await apiClient.get("admin/users/", { params });
    const wrapper = (response as any).pagination as PaginatedUsers | undefined;
    if (wrapper) return wrapper;
    return {
      count: Array.isArray(response.data) ? response.data.length : 0,
      next_cursor: null,
      previous_cursor: null,
      results: response.data,
    };
  },

  async getUser(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.get(`admin/users/${userId}/`);
    return data;
  },

  async transition(
    userId: string,
    newStatus: string,
    reason: string
  ): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`admin/users/${userId}/transition/`, {
      new_status: newStatus,
      reason,
    });
    return data;
  },

  async reviewPhoto(
    userId: string,
    decision: "APPROVED" | "REJECTED"
  ): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`admin/users/${userId}/review-photo/`, {
      decision,
    });
    return data;
  },

  async assignRole(
    userId: string,
    role: string,
    siteIds: string[]
  ): Promise<AdminUserDetail> {
    const { data } = await apiClient.post(`admin/users/${userId}/assign-role/`, {
      role,
      site_ids: siteIds,
    });
    return data;
  },

  async unlock(userId: string): Promise<void> {
    await apiClient.post(`admin/users/${userId}/unlock/`);
  },

  async createCourier(payload: {
    username: string;
    password: string;
    legal_first_name: string;
    legal_last_name: string;
    employee_student_id: string;
    site_ids: string[];
  }): Promise<AdminUserDetail> {
    const { data } = await apiClient.post("admin/users/create-courier/", payload);
    return data;
  },

  // ---------------------------------------------------------------------------
  // Sites
  // ---------------------------------------------------------------------------

  async listSites(): Promise<Site[]> {
    const { data } = await apiClient.get("admin/sites/");
    return data;
  },

  // ---------------------------------------------------------------------------
  // Tenants (superuser only)
  // ---------------------------------------------------------------------------

  async listTenants(): Promise<Tenant[]> {
    const { data } = await apiClient.get("admin/tenants/");
    return data;
  },

  async createTenant(payload: { name: string; slug: string; is_active?: boolean }): Promise<Tenant> {
    const { data } = await apiClient.post("admin/tenants/", payload);
    return data;
  },

  async getTenant(id: string): Promise<Tenant> {
    const { data } = await apiClient.get(`admin/tenants/${id}/`);
    return data;
  },

  async updateTenant(id: string, payload: Partial<Pick<Tenant, "name" | "slug" | "is_active">>): Promise<Tenant> {
    const { data } = await apiClient.patch(`admin/tenants/${id}/`, payload);
    return data;
  },

  async listTenantSites(tenantId: string): Promise<TenantSite[]> {
    const { data } = await apiClient.get(`admin/tenants/${tenantId}/sites/`);
    return data;
  },

  async createTenantSite(tenantId: string, payload: { name: string; address?: string; timezone?: string; is_active?: boolean }): Promise<TenantSite> {
    const { data } = await apiClient.post(`admin/tenants/${tenantId}/sites/`, payload);
    return data;
  },

  async updateTenantSite(tenantId: string, siteId: string, payload: Partial<Pick<TenantSite, "name" | "address" | "timezone" | "is_active">>): Promise<TenantSite> {
    const { data } = await apiClient.patch(`admin/tenants/${tenantId}/sites/${siteId}/`, payload);
    return data;
  },
};
