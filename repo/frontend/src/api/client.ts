/**
 * Axios API client.
 * - Base URL: /api/v1/
 * - Reads CSRF token from the `csrftoken` cookie and sends it as X-CSRFToken header
 * - Sends credentials (session cookie) with every request
 * - Attaches DRF Token auth header when a token is stored in sessionStorage
 *
 * Anti-tampering / request integrity:
 * The combination of CSRF token (prevents cross-site request forgery) and Bearer
 * token (ensures only authenticated clients mutate state) is the accepted security
 * model for this application. Per-request HMAC signing is not used: a shared secret
 * embedded in client-side JS would be visible to all users and add no real security
 * beyond what CSRF + token auth already provide. See docs/design.md §8.
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

// Normalise error shape + global status handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // 401 — session expired, redirect to login
    if (status === 401) {
      sessionStorage.removeItem("auth_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    // 429 — rate limited, surface Retry-After in message
    if (status === 429) {
      const retryAfter = error.response?.headers?.["retry-after"];
      const msg = retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds.`
        : "Too many requests. Please wait a moment.";
      const enhanced = new Error(msg);
      (enhanced as any).status = 429;
      (enhanced as any).response = error.response;
      return Promise.reject(enhanced);
    }

    // 500 — server error
    if (status >= 500) {
      const enhanced = new Error("Something went wrong. Please try again.");
      (enhanced as any).status = status;
      (enhanced as any).response = error.response;
      return Promise.reject(enhanced);
    }

    // Other structured errors
    const serverError = error.response?.data?.error;
    if (serverError) {
      const enhanced = new Error(serverError.message ?? "An error occurred");
      (enhanced as any).code    = serverError.code;
      (enhanced as any).detail  = serverError.detail;
      (enhanced as any).status  = status;
      (enhanced as any).response = error.response;
      return Promise.reject(enhanced);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
