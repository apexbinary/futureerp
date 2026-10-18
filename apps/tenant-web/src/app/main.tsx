import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, ToastProvider, AuthProvider } from "@future-erp/ui-kit";
import "@future-erp/ui-kit/styles.css";
import App from "../App";

const ERP_SERVER_URL = import.meta.env.VITE_ERP_SERVER_URL ?? "http://localhost:8001";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider baseUrl={ERP_SERVER_URL}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
