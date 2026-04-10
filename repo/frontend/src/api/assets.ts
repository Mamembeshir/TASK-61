/**
 * Asset Ledger API client.
 * Covers assets, classifications, bulk import, and export.
 */
import apiClient from "./client";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface Classification {
  id: string;
  code: string;
  name: string;
  level: number;
  parent: string | null;
  is_active: boolean;
  children: Classification[];
}

// ---------------------------------------------------------------------------
// Site (accessible to all roles via /api/v1/tenants/sites/)
// ---------------------------------------------------------------------------

export interface Site {
  id: string;
  name: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

export interface AssetSummary {
  id: string;
  asset_code: string;
  name: string;
  classification_name: string;
  site_name: string;
  current_version_number: number | null;
  updated_at: string | null;
  is_deleted: boolean;
  created_at: string;
}

export interface AssetDetail extends AssetSummary {
  data_snapshot: Record<string, string> | null;
  classification: Classification;
  fingerprint: string;
}

export interface PaginatedAssets {
  count: number;
  next_cursor: string | null;
  previous_cursor: string | null;
  results: AssetSummary[];
}

// ---------------------------------------------------------------------------
// Asset version
// ---------------------------------------------------------------------------

export interface AssetVersion {
  id: string;
  version_number: number;
  data_snapshot: Record<string, string>;
  change_source: "MANUAL" | "BULK_IMPORT" | "CORRECTION";
  changed_by_username: string | null;
  note: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type ImportRowStatus =
  | "NEW"
  | "UPDATE_CANDIDATE"
  | "DUPLICATE"
  | "REJECTED"
  | "BATCH_DUPLICATE";

export interface ImportRow {
  row_number: number;
  status: ImportRowStatus;
  asset_code: string;
  name: string;
  classification_code: string;
  custom_data: Record<string, string>;
  errors: string[];
  existing_asset_id: string | null;
}

export interface ImportPreview {
  import_id: string;
  status: string;
  new_count: number;
  update_count: number;
  duplicate_count: number;
  rejected_count: number;
  batch_duplicate_count: number;
  total: number;
  rows: ImportRow[];
}

export interface ImportCorrection {
  row_number: number;
  field: string;
  new_value: string;
}

export interface ImportDecision {
  row_number: number;
  action: "create" | "update" | "skip";
}

export interface ImportResult {
  import_id: string;
  created: number;
  updated: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const assetsApi = {
  // ---- Sites (all roles) ----

  async listSites(): Promise<Site[]> {
    const { data } = await apiClient.get("tenants/sites/");
    return data;
  },

  // ---- Classifications ----

  async listClassifications(): Promise<Classification[]> {
    const { data } = await apiClient.get("asset-classifications/");
    return data;
  },

  // ---- Assets ----

  async listAssets(params?: {
    site_id?: string;
    classification_id?: string;
    search?: string;
    cursor?: string;
    page_size?: number;
    include_deleted?: boolean;
  }): Promise<PaginatedAssets> {
    const { data } = await apiClient.get("assets/", { params });
    return data;
  },

  async getAsset(id: string): Promise<AssetDetail> {
    const { data } = await apiClient.get(`assets/${id}/`);
    return data;
  },

  async createAsset(payload: {
    asset_code: string;
    name: string;
    site_id: string;
    classification_id: string;
    custom_data?: Record<string, string>;
  }): Promise<AssetDetail> {
    const { data } = await apiClient.post("assets/", payload);
    return data;
  },

  async updateAsset(
    id: string,
    payload: {
      name: string;
      classification_id: string;
      custom_data?: Record<string, string>;
      version_number: number;
    }
  ): Promise<AssetDetail> {
    const { data } = await apiClient.put(`assets/${id}/`, payload);
    return data;
  },

  async deleteAsset(id: string): Promise<void> {
    await apiClient.delete(`assets/${id}/`);
  },

  async getTimeline(id: string): Promise<AssetVersion[]> {
    const { data } = await apiClient.get(`assets/${id}/timeline/`);
    return data;
  },

  async getAsOf(id: string, at: string): Promise<AssetVersion> {
    const { data } = await apiClient.get(`assets/${id}/as-of/`, { params: { at } });
    return data;
  },

  // ---- Import ----

  async uploadImport(file: File, siteId: string): Promise<ImportPreview> {
    const form = new FormData();
    form.append("file", file);
    form.append("site_id", siteId);
    const { data } = await apiClient.post("assets/import/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async getImportStatus(jobId: string): Promise<ImportPreview> {
    const { data } = await apiClient.get(`assets/import/${jobId}/`);
    return data;
  },

  async applyCorrections(
    jobId: string,
    corrections: ImportCorrection[]
  ): Promise<ImportPreview> {
    const { data } = await apiClient.post(`assets/import/${jobId}/correct/`, {
      corrections,
    });
    return data;
  },

  async confirmImport(
    jobId: string,
    decisions: ImportDecision[]
  ): Promise<ImportResult> {
    const { data } = await apiClient.post(`assets/import/${jobId}/confirm/`, {
      decisions,
    });
    return data;
  },

  // ---- Export ----

  async downloadExport(params?: {
    site_id?: string;
    file_format?: "xlsx" | "csv";
  }): Promise<void> {
    const response = await apiClient.get("assets/export/", {
      params: {
        file_format: params?.file_format ?? "xlsx",
        ...(params?.site_id ? { site_id: params.site_id } : {}),
      },
      responseType: "blob",
    });
    const disposition: string = response.headers["content-disposition"] ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? "assets_export.xlsx";

    const url = URL.createObjectURL(new Blob([response.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
