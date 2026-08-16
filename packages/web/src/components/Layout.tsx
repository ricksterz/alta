import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SiteFooter } from "./SiteFooter";
import { ThemeToggle } from "./ThemeToggle";

const ROLE_LABELS: Record<string, string> = {
  advisor_admin: "Admin",
  advisor_rep: "Rep",
  gp_ops: "GP Ops",
  fund_admin_ops: "Fund Admin",
  legal_ops: "Legal",
  custodian_ops: "Custodian",
  investor_principal: "Investor",
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isSponsor = user?.tenantType === "sponsor_firm";
  const isFundAdmin = user?.tenantType === "fund_admin";
  const isFundLegal = user?.tenantType === "fund_legal";
  const isCustodian = user?.tenantType === "custodian";
  // Positions ("Register") is only scoped for advisor_firm and sponsor_firm —
  // see Position in scopedClient.ts's MULTI_OWNED_MODELS.
  const canSeePositions = !isFundAdmin && !isFundLegal && !isCustodian;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-800">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Alta
            </Link>
            {user && (
              <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                {isSponsor && (
                  <Link to="/funds" className="hover:text-slate-900 dark:hover:text-slate-100">
                    Funds
                  </Link>
                )}
                {!isSponsor && !isFundAdmin && !isFundLegal && !isCustodian && (
                  <Link to="/investors" className="hover:text-slate-900 dark:hover:text-slate-100">
                    Investors
                  </Link>
                )}
                {isFundLegal && (
                  <Link to="/templates" className="hover:text-slate-900 dark:hover:text-slate-100">
                    Legal review
                  </Link>
                )}
                {!isFundLegal && (
                  <Link to="/subscriptions" className="hover:text-slate-900 dark:hover:text-slate-100">
                    Subscriptions
                  </Link>
                )}
                {canSeePositions && (
                  <Link to="/register" className="hover:text-slate-900 dark:hover:text-slate-100">
                    Register
                  </Link>
                )}
                <Link to="/audit" className="hover:text-slate-900 dark:hover:text-slate-100">
                  Audit
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            <ThemeToggle />
            {user && (
              <>
                <span>
                  {user.firstName} {user.lastName}
                  <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Switch role
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
