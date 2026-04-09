/**
 * Axios API client.
 * - Base URL: /api/v1/
 * - Reads CSRF token from the `csrftoken` cookie and sends it as X-CSRFToken header
 * - Sends credentials (session cookie) with every request
 * - Attaches DRF Token auth header when a token is stored in sessionStorage
 */
import axios from "axios";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

const apiClient = axios.create({
  baseURL: "/api/v1/",
  withCredentials: true,       // send session cookie
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Attach CSRF token and optional Bearer token before every mutating request
apiClient.interceptors.request.use((config) => {
  const csrf = getCookie("csrftoken");
  if (csrf) {
    config.headers["X-CSRFToken"] = csrf;
  }

  const token = sessionStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Token ${token}`;
  }

  return config;
});

// Normalise error shape — re-throw with the server's error.message when available
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverError = error.response?.data?.error;
    if (serverError) {
      const enhanced = new Error(serverError.message ?? "An error occurred");
      (enhanced as any).code = serverError.code;
      (enhanced as any).detail = serverError.detail;
      (enhanced as any).status = error.response.status;
      return Promise.reject(enhanced);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
