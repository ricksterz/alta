import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Home() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.tenantType === "sponsor_firm") return <Navigate to="/funds" replace />;
  // A fund administrator and a custodian have no investors and no funds of
  // their own — their whole job on the platform is a review/action queue.
  if (user.tenantType === "fund_admin" || user.tenantType === "custodian") {
    return <Navigate to="/subscriptions" replace />;
  }
  // Fund counsel has no subscriptions either — only the templates it's asked
  // to review.
  if (user.tenantType === "fund_legal") return <Navigate to="/templates" replace />;
  return <Navigate to="/investors" replace />;
}
