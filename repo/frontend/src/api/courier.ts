/**
 * Courier API client — delivery tasks for COURIER role.
 */
import apiClient from "@/api/client";

export type DeliveryType = "PICKUP" | "DROP";
export type TaskStatus   = "TODO" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "CANCELLED";

export interface CourierTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string;
  delivery_type: DeliveryType;
  delivery_type_display: string;
  pickup_location: string | null;
  drop_location: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export const courierApi = {
  async listTasks(): Promise<CourierTask[]> {
    const { data } = await apiClient.get("courier/tasks/");
    return data;
  },

  async confirmTask(id: string): Promise<CourierTask> {
    const { data } = await apiClient.post(`courier/tasks/${id}/confirm/`);
    return data;
  },
};
