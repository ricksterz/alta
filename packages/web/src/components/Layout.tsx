import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  advisor_admin: "Admin",
  advisor_rep: "Rep",
  gp_ops: "GP Ops",
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isSponsor = user?.tenantType === "sponsor_firm";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold tracking-tight text-slate-900">
              Alta
            </Link>
            {user && (
              <nav className="flex items-center gap-4 text-sm text-slate-600">
                {isSponsor ? (
                  <Link to="/funds" className="hover:text-slate-900">
                    Funds
                  </Link>
                ) : (
                  <Link to="/investors" className="hover:text-slate-900">
                    Investors
                  </Link>
                )}
              </nav>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span>
                {user.firstName} {user.lastName}
                <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
