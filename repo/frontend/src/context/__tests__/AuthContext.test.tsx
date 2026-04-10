import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "../AuthContext";

// ---- mock authApi --------------------------------------------------------
const { mockMe, mockLogin, mockLogout } = vi.hoisted(() => ({
  mockMe: vi.fn(),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock("@/api/auth", () => ({
  authApi: { me: mockMe, login: mockLogin, logout: mockLogout },
}));

// ---- helper: consumer component -----------------------------------------
function Consumer() {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!currentUser) return <div>no user</div>;
  return <div>user:{currentUser.username}</div>;
}

const fakeUser = {
  id: "1",
  username: "alice",
  role: "STAFF" as const,
  status: "ACTIVE" as const,
  tenantId: "acme",
  legalFirstName: "Alice",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

// -------------------------------------------------------------------------

describe("AuthProvider — session rehydration on mount", () => {
  it("shows user when me() resolves", async () => {
    mockMe.mockResolvedValueOnce(fakeUser);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("user:alice")).toBeInTheDocument());
  });

  it("shows no user when me() rejects (unauthenticated)", async () => {
    mockMe.mockRejectedValueOnce(new Error("401"));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("no user")).toBeInTheDocument());
  });
});

describe("AuthProvider — login", () => {
  it("sets currentUser after successful login", async () => {
    mockMe.mockRejectedValueOnce(new Error("401")); // initial rehydration fails
    mockLogin.mockResolvedValueOnce(fakeUser);

    function LoginButton() {
      const { currentUser, login } = useAuth();
      return (
        <>
          <div>{currentUser ? `user:${currentUser.username}` : "no user"}</div>
          <button onClick={() => login("alice", "pass")}>login</button>
        </>
      );
    }

    render(
      <AuthProvider>
        <LoginButton />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("no user")).toBeInTheDocument());

    await act(async () => {
      screen.getByRole("button", { name: "login" }).click();
    });

    await waitFor(() => expect(screen.getByText("user:alice")).toBeInTheDocument());
    expect(mockLogin).toHaveBeenCalledWith("alice", "pass", undefined);
  });

  it("propagates login errors to the caller", async () => {
    mockMe.mockRejectedValueOnce(new Error("401"));
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    function LoginButton() {
      const { login } = useAuth();
      const [err, setErr] = React.useState("");
      return (
        <>
          <button onClick={() => login("alice", "bad").catch((e) => setErr(e.message))}>
            login
          </button>
          {err && <div>error:{err}</div>}
        </>
      );
    }

    render(
      <AuthProvider>
        <LoginButton />
      </AuthProvider>
    );

    await waitFor(() => screen.getByRole("button", { name: "login" }));

    await act(async () => {
      screen.getByRole("button", { name: "login" }).click();
    });

    await waitFor(() => expect(screen.getByText("error:Invalid credentials")).toBeInTheDocument());
  });
});

describe("AuthProvider — logout", () => {
  it("clears currentUser after logout", async () => {
    mockMe.mockResolvedValueOnce(fakeUser);
    mockLogout.mockResolvedValueOnce(undefined);

    function LogoutButton() {
      const { currentUser, logout } = useAuth();
      return (
        <>
          <div>{currentUser ? `user:${currentUser.username}` : "no user"}</div>
          <button onClick={logout}>logout</button>
        </>
      );
    }

    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("user:alice")).toBeInTheDocument());

    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });

    await waitFor(() => expect(screen.getByText("no user")).toBeInTheDocument());
    expect(mockLogout).toHaveBeenCalledOnce();
  });
});

describe("useAuth — outside provider", () => {
  it("throws when used outside AuthProvider", () => {
    // Suppress React's error boundary noise
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });
});
