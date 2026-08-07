import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Home() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={user.tenantType === "sponsor_firm" ? "/funds" : "/investors"} replace />;
}
