import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, ToastProvider, AuthProvider } from "@future-erp/ui-kit";
import "@future-erp/ui-kit/styles.css";
import App from "../App";

const CONTROL_PLANE_URL = import.meta.env.VITE_CONTROL_PLANE_URL ?? "http://localhost:8000";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider baseUrl={CONTROL_PLANE_URL}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
