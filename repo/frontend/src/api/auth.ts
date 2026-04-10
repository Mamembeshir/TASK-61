import apiClient from "./client";
import type { CurrentUser } from "@/context/AuthContext";

function toCurrentUser(data: any): CurrentUser {
  return {
    id: data.id,
    username: data.username,
    role: data.role,
    status: data.status,
    tenantId: data.tenant_slug ?? null,
    legalFirstName: data.legal_first_name ?? null,
    isSuperuser: data.is_superuser ?? false,
  };
}

export const authApi = {
  async login(username: string, password: string, tenantSlug?: string): Promise<CurrentUser> {
    const body: Record<string, string> = { username, password };
    if (tenantSlug) body.tenant_slug = tenantSlug;
    const { data } = await apiClient.post("auth/login/", body);
    if (data.token) sessionStorage.setItem("auth_token", data.token);
    // Login response: { token, profile }
    return toCurrentUser(data.profile);
  },

  async logout(): Promise<void> {
    await apiClient.post("auth/logout/");
    sessionStorage.removeItem("auth_token");
  },

  async me(): Promise<CurrentUser> {
    const { data } = await apiClient.get("auth/me/");
    return toCurrentUser(data);
  },

  async register(payload: {
    username: string;
    password: string;
    legalFirstName: string;
    legalLastName: string;
    employeeStudentId: string;
    governmentId?: string;
    photoId?: File;
    tenantSlug: string;
  }): Promise<void> {
    const form = new FormData();
    form.append("username", payload.username);
    form.append("password", payload.password);
    form.append("legal_first_name", payload.legalFirstName);
    form.append("legal_last_name", payload.legalLastName);
    form.append("employee_student_id", payload.employeeStudentId);
    form.append("tenant_slug", payload.tenantSlug);
    if (payload.governmentId) form.append("government_id", payload.governmentId);
    if (payload.photoId) form.append("photo_id", payload.photoId);
    await apiClient.post("auth/register/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
