import { type ReactElement } from "react";
import { Lock } from "lucide-react";
import { Routes, Route } from "react-router-dom";
import { AppShell, LoginScreen, useAuth } from "@future-erp/ui-kit";
import { useEntitlements } from "./data/entitlementsApi";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { ChartOfAccountsPage } from "./pages/finance/ChartOfAccountsPage";
import { JournalEntriesPage } from "./pages/finance/JournalEntriesPage";
import { TaxWizardPage } from "./pages/finance/TaxWizardPage";
import { CustomerInvoicesPage } from "./pages/finance/CustomerInvoicesPage";
import { CustomersPage } from "./pages/finance/CustomersPage";
import { ItemsPage } from "./pages/finance/ItemsPage";
import { ReportsPage } from "./pages/finance/ReportsPage";
import { VendorsPage } from "./pages/finance/VendorsPage";
import { VendorBillsPage } from "./pages/finance/VendorBillsPage";
import { PaymentsPage } from "./pages/finance/PaymentsPage";
import { AssetsPage } from "./pages/finance/AssetsPage";
import { CostCentersPage } from "./pages/finance/CostCentersPage";
import { AgingPage } from "./pages/finance/AgingPage";
import { ProfitCentersPage } from "./pages/finance/ProfitCentersPage";
import { OrganizationPage } from "./pages/finance/OrganizationPage";
import { Placeholder } from "./pages/Placeholder";
import { UsersPage } from "./pages/admin/UsersPage";
import { RolesPage } from "./pages/admin/RolesPage";
import { PagesPage } from "./pages/admin/PagesPage";
import { PermissionsPage } from "./pages/admin/PermissionsPage";
import { MatrixPage } from "./pages/admin/MatrixPage";
import { SmtpConfigsPage } from "./pages/admin/SmtpConfigsPage";
import { EmailModulesPage } from "./pages/admin/EmailModulesPage";
import { EmailLogsPage } from "./pages/admin/EmailLogsPage";
import { shellConfig, allSections } from "./shell.config";

const realPages: Record<string, ReactElement> = {
  "/": <DashboardPage />,
  "/finance": <CustomerInvoicesPage />,
  "/finance/demo-invoices": <InvoicesPage />,
  "/finance/accounts": <ChartOfAccountsPage />,
  "/finance/customers": <CustomersPage />,
  "/finance/items": <ItemsPage />,
  "/finance/journal": <JournalEntriesPage />,
  "/finance/tax": <TaxWizardPage />,
  "/finance/reports": <ReportsPage />,
  "/finance/vendors": <VendorsPage />,
  "/finance/bills": <VendorBillsPage />,
  "/finance/payments": <PaymentsPage />,
  "/finance/assets": <AssetsPage />,
  "/finance/cost-centers": <CostCentersPage />,
  "/finance/profit-centers": <ProfitCentersPage />,
  "/finance/organization": <OrganizationPage />,
  "/finance/aging": <AgingPage />,
  "/admin": <UsersPage />,
  "/admin/roles": <RolesPage />,
  "/admin/pages": <PagesPage />,
  "/admin/permissions": <PermissionsPage />,
  "/admin/matrix": <MatrixPage />,
  "/admin/smtp": <SmtpConfigsPage />,
  "/admin/email-modules": <EmailModulesPage />,
  "/admin/email-logs": <EmailLogsPage />,
};

// Which licensed feature each path needs (unlisted paths are always available).
const PATH_ENTITLEMENT: Record<string, string> = {
  "/finance": "finance.ar",
  "/finance/customers": "finance.ar",
  "/finance/items": "finance.ar",
  "/finance/vendors": "finance.ap",
  "/finance/bills": "finance.ap",
  "/finance/accounts": "finance.gl",
  "/finance/journal": "finance.gl",
  "/finance/payments": "finance.gl",
  "/finance/aging": "finance.gl",
  "/finance/reports": "finance.gl",
  "/finance/profit-centers": "finance.co",
  "/finance/organization": "finance.gl",
  "/finance/tax": "finance.tax",
  "/finance/assets": "finance.aa",
  "/finance/cost-centers": "finance.co",
};

function Loading() {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
      Loading…
    </div>
  );
}

function NotLicensed({ feature }: { feature: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "80px 24px", textAlign: "center", color: "var(--text-muted)" }}>
      <div style={{ width: 52, height: 52, borderRadius: "var(--r-lg)", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--text-faint)", marginBottom: 16 }}>
        <Lock size={24} />
      </div>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--text)" }}>{feature} isn’t in your plan</h2>
      <p style={{ margin: 0, maxWidth: 360, fontSize: 13 }}>
        This feature isn’t included in your current subscription. Contact your administrator to add it.
      </p>
    </div>
  );
}

function AuthedApp() {
  const { has, loading } = useEntitlements();
  if (loading) return <Loading />;

  // Hide sidebar items the tenant isn't licensed for.
  const cfg = {
    ...shellConfig,
    sections: shellConfig.sections
      .map((s) => ({ ...s, children: s.children.filter((c) => has(PATH_ENTITLEMENT[c.path])) }))
      .filter((s) => s.children.length > 0),
  };

  return (
    <Routes>
      <Route element={<AppShell config={cfg} />}>
        {allSections.flatMap((section) =>
          section.children.map((child) => {
            const key = PATH_ENTITLEMENT[child.path];
            const element = !has(key)
              ? <NotLicensed feature={child.label} />
              : (realPages[child.path] ?? <Placeholder title={child.label} note={section.label} />);
            return child.path === "/" ? (
              <Route index element={element} key={child.path} />
            ) : (
              <Route path={child.path.slice(1)} element={element} key={child.path} />
            );
          }),
        )}
      </Route>
    </Routes>
  );
}

export default function App() {
  const { status, error, login } = useAuth();

  if (status === "loading") return <Loading />;

  if (status === "anon") {
    return (
      <LoginScreen
        brandName="FUTURE_ERP"
        headline="Run your business, beautifully."
        tagline="Sign in to your workspace."
        features={[
          "Finance, sales, inventory & HR in one place",
          "Real-time insight across your operation",
          "Secure, and always up to date",
        ]}
        footer="© FUTURE_ERP"
        error={error}
        onSubmit={login}
      />
    );
  }

  return <AuthedApp />;
}
