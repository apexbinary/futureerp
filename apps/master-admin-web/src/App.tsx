import { type ReactElement } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell, LoginScreen, useAuth } from "@future-erp/ui-kit";
import { OverviewPage } from "./pages/OverviewPage";
import { TenantsPage } from "./pages/TenantsPage";
import { Placeholder } from "./pages/Placeholder";
import { shellConfig, allSections } from "./shell.config";

const realPages: Record<string, ReactElement> = {
  "/": <OverviewPage />,
  "/tenants": <TenantsPage />,
};

export default function App() {
  const { status, error, login } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
        Loading…
      </div>
    );
  }

  if (status === "anon") {
    return (
      <LoginScreen
        brandName="FUTURE_ERP Admin"
        headline="Command your entire fleet."
        tagline="Sign in to the control plane."
        features={[
          "Every tenant, everywhere — cloud & self-hosted",
          "Issue licenses & push signed updates",
          "Fleet health, telemetry & full audit",
        ]}
        footer="© FUTURE_ERP · Control Plane"
        error={error}
        onSubmit={login}
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppShell config={shellConfig} />}>
        {allSections.flatMap((section) =>
          section.children.map((child) => {
            const element =
              realPages[child.path] ?? (
                <Placeholder title={child.label} note={`${section.label} · ${section.description}`} />
              );
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
