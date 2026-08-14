import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { Home } from "./pages/Home";
import { DashboardPage } from "./pages/DashboardPage";
import { InvestorWizardPage } from "./pages/InvestorWizardPage";
import { InvestorDetailPage } from "./pages/InvestorDetailPage";
import { FundsDashboardPage } from "./pages/funds/FundsDashboardPage";
import { FundFormPage } from "./pages/funds/FundFormPage";
import { FundDetailPage } from "./pages/funds/FundDetailPage";
import { TemplateMappingPage } from "./pages/funds/TemplateMappingPage";
import { NewSubscriptionPage } from "./pages/subscriptions/NewSubscriptionPage";
import { SubscriptionDetailPage } from "./pages/subscriptions/SubscriptionDetailPage";
import { SubscriptionsQueuePage } from "./pages/subscriptions/SubscriptionsQueuePage";
import { RegisterPage } from "./pages/RegisterPage";
import { AuditPage } from "./pages/AuditPage";
import { LegalReviewQueuePage } from "./pages/templates/LegalReviewQueuePage";
import { LpViewPage } from "./pages/lp/LpViewPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lp/:token" element={<LpViewPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />

            <Route path="/investors" element={<DashboardPage />} />
            <Route path="/investors/new" element={<InvestorWizardPage />} />
            <Route path="/investors/:id" element={<InvestorDetailPage />} />

            <Route path="/funds" element={<FundsDashboardPage />} />
            <Route path="/funds/new" element={<FundFormPage />} />
            <Route path="/funds/:id" element={<FundDetailPage />} />
            <Route path="/templates/:id" element={<TemplateMappingPage />} />
            <Route path="/templates" element={<LegalReviewQueuePage />} />

            <Route path="/subscriptions" element={<SubscriptionsQueuePage />} />
            <Route path="/subscriptions/new" element={<NewSubscriptionPage />} />
            <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />

            <Route path="/register" element={<RegisterPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
