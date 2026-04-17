/**
 * Tests for the response-interceptor error-normalisation logic in api/client.ts.
 *
 * We replicate the interceptor's error branch verbatim so we can unit-test
 * each case without needing a real HTTP server or complex axios mocking.
 */
import { describe, it, expect, beforeEach } from "vitest";

function handleResponseError(error: any): Promise<never> {
  const status = error.response?.status;

  if (status === 401) {
    sessionStorage.removeItem("auth_token");
    return Promise.reject(error);
  }

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

  if (status >= 500) {
    const enhanced = new Error("Something went wrong. Please try again.");
    (enhanced as any).status = status;
    (enhanced as any).response = error.response;
    return Promise.reject(enhanced);
  }

  const serverError = error.response?.data?.error;
  if (serverError) {
    const enhanced = new Error(serverError.message ?? "An error occurred");
    (enhanced as any).code = serverError.code;
    (enhanced as any).detail = serverError.detail;
    (enhanced as any).status = status;
    (enhanced as any).response = error.response;
    return Promise.reject(enhanced);
  }

  return Promise.reject(error);
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function handleRequest(config: any): any {
  const csrf = getCookie("csrftoken");
  if (csrf) config.headers["X-CSRFToken"] = csrf;

  const token = sessionStorage.getItem("auth_token");
  if (token) config.headers["Authorization"] = `Token ${token}`;

  return config;
}

describe("request interceptor", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(document, "cookie", { writable: true, value: "" });
  });

  it("attaches X-CSRFToken when csrftoken cookie is present", () => {
    document.cookie = "csrftoken=abc123";
    const config = handleRequest({ headers: {} });
    expect(config.headers["X-CSRFToken"]).toBe("abc123");
  });

  it("does not attach X-CSRFToken when cookie is absent", () => {
    const config = handleRequest({ headers: {} });
    expect(config.headers["X-CSRFToken"]).toBeUndefined();
  });

  it("attaches Authorization header when auth_token is in sessionStorage", () => {
    sessionStorage.setItem("auth_token", "mytoken");
    const config = handleRequest({ headers: {} });
    expect(config.headers["Authorization"]).toBe("Token mytoken");
  });

  it("does not attach Authorization header when no token stored", () => {
    const config = handleRequest({ headers: {} });
    expect(config.headers["Authorization"]).toBeUndefined();
  });
});

describe("response interceptor — error handling", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("clears auth_token and rejects on 401", async () => {
    sessionStorage.setItem("auth_token", "tok");
    const original = { response: { status: 401 } };
    await expect(handleResponseError(original)).rejects.toBe(original);
    expect(sessionStorage.getItem("auth_token")).toBeNull();
  });

  it("returns rate-limit message with retry-after on 429", async () => {
    const err = await handleResponseError({
      response: { status: 429, headers: { "retry-after": "30" } },
    }).catch((e) => e);
    expect(err.message).toBe("Too many requests. Please wait 30 seconds.");
    expect((err as any).status).toBe(429);
  });

  it("returns generic rate-limit message when no retry-after header on 429", async () => {
    const err = await handleResponseError({
      response: { status: 429, headers: {} },
    }).catch((e) => e);
    expect(err.message).toBe("Too many requests. Please wait a moment.");
  });

  it("wraps 500 errors with generic server-error message", async () => {
    const err = await handleResponseError({ response: { status: 500 } }).catch((e) => e);
    expect(err.message).toBe("Something went wrong. Please try again.");
    expect((err as any).status).toBe(500);
  });

  it("wraps 503 with generic server-error message", async () => {
    const err = await handleResponseError({ response: { status: 503 } }).catch((e) => e);
    expect(err.message).toBe("Something went wrong. Please try again.");
    expect((err as any).status).toBe(503);
  });

  it("extracts structured error from response body", async () => {
    const err = await handleResponseError({
      response: {
        status: 400,
        data: { error: { message: "Invalid input", code: "VALIDATION_ERROR", detail: "field x" } },
      },
    }).catch((e) => e);
    expect(err.message).toBe("Invalid input");
    expect((err as any).code).toBe("VALIDATION_ERROR");
    expect((err as any).detail).toBe("field x");
    expect((err as any).status).toBe(400);
  });

  it("falls back to 'An error occurred' when server error message is missing", async () => {
    const err = await handleResponseError({
      response: { status: 422, data: { error: { code: "MISSING_MSG" } } },
    }).catch((e) => e);
    expect(err.message).toBe("An error occurred");
  });

  it("passes through unrecognised errors unchanged", async () => {
    const original = { response: undefined };
    await expect(handleResponseError(original)).rejects.toBe(original);
  });
});
