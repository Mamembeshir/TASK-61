import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { authApi } from "@/api/auth";

export interface CurrentUser {
  id: string;
  username: string;
  role: "ADMIN" | "STAFF" | "COURIER";
  status: "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  tenantId: string | null;
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate session on mount
  useEffect(() => {
    authApi
      .me()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await authApi.login(username, password);
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
