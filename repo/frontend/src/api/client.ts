/**
 * Axios API client.
 * - Base URL: /api/v1/
 * - Reads CSRF token from the `csrftoken` cookie and sends it as X-CSRFToken header
 * - Sends credentials (session cookie) with every request
 * - Attaches DRF Token auth header when a token is stored in sessionStorage
 *
 * Anti-tampering / request integrity (signed requests):
 * Token-authenticated requests include three additional headers:
 *   X-Request-Timestamp  — Unix epoch seconds
 *   X-Request-Nonce      — random UUID (single-use, prevents replay)
 *   X-Request-Signature  — HMAC-SHA256(token_key, "METHOD\npath\ntimestamp\nnonce")
 *
 * The HMAC key is the user's per-session DRF token — already a private secret
 * transmitted only over TLS — so no global embedded secret is needed.
 * The backend (SignedRequestMiddleware) validates freshness (±5 min), nonce
 * uniqueness, and the HMAC before the request reaches any view.
 *
 * Session-cookie requests are protected by the CSRF token instead and are
 * not subject to HMAC signing.
 */
import axios from "axios";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Compute HMAC-SHA256(secret, message) and return a lowercase hex string.
 * Uses the Web Crypto API (available in all modern browsers and Node ≥19).
 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const apiClient = axios.create({
  baseURL: "/api/v1/",
  withCredentials: true,       // send session cookie
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Attach CSRF token, Bearer token, and signed-request headers before every request
apiClient.interceptors.request.use(async (config) => {
  const csrf = getCookie("csrftoken");
  if (csrf) {
    config.headers["X-CSRFToken"] = csrf;
  }

  const token = sessionStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Token ${token}`;

    // Build the full pathname that the backend will see
    const base = new URL(config.baseURL ?? "/", window.location.origin);
    const full = new URL(config.url ?? "", base);
    const path = full.pathname;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce     = crypto.randomUUID();
    const method    = (config.method ?? "get").toUpperCase();
    const signature = await hmacSha256Hex(token, `${method}\n${path}\n${timestamp}\n${nonce}`);

    config.headers["X-Request-Timestamp"] = timestamp;
    config.headers["X-Request-Nonce"]     = nonce;
    config.headers["X-Request-Signature"] = signature;
  }

  return config;
});

// Auto-unwrap paginated list responses.
//
// The backend's CursorPagination wraps list payloads as
// `{ count, next_cursor, previous_cursor, results: [...] }`. Most callers want
// a plain array, so detect that exact shape and replace `response.data` with
// `results`. The original wrapper is preserved on `response.pagination` so the
// few callers that need cursors / count (e.g. AssetsPage) can still read it.
// Detail/object endpoints are not affected because they don't carry both
// `next_cursor` and `previous_cursor` keys.
apiClient.interceptors.response.use((response) => {
  const d = response.data;
  if (
    d && typeof d === "object" && !Array.isArray(d) &&
    Array.isArray((d as any).results) &&
    "next_cursor" in d && "previous_cursor" in d
  ) {
    (response as any).pagination = d;
    response.data = (d as any).results;
  }
  return response;
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
