import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { AdvisorRepSummary } from "../lib/types";

interface AuthState {
  user: AdvisorRepSummary | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsDemo: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdvisorRepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdvisorRepSummary>("/auth/me")
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error(err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const me = await api.post<AdvisorRepSummary>("/auth/login", { email, password });
    setUser(me);
  }

  /** Demo role switching — server-side allowlist, see routes/auth.ts. */
  async function loginAsDemo(email: string) {
    const me = await api.post<AdvisorRepSummary>("/auth/demo-login", { email });
    setUser(me);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
