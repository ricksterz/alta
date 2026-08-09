import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Home() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.tenantType === "sponsor_firm") return <Navigate to="/funds" replace />;
  // A fund administrator has no investors and no funds of its own — its whole
  // job on the platform is the review queue.
  if (user.tenantType === "fund_admin") return <Navigate to="/subscriptions" replace />;
  return <Navigate to="/investors" replace />;
}
