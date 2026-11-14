import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/shell/AppShell";

import Overview from "@/pages/Overview";
import LossExplorer from "@/pages/LossExplorer";
import ProductPerformance from "@/pages/ProductPerformance";
import DiscountAnalysis from "@/pages/DiscountAnalysis";
import DataSources from "@/pages/DataSources";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Overview />} />
              <Route path="/loss-explorer" element={<LossExplorer />} />
              <Route path="/products" element={<ProductPerformance />} />
              <Route path="/discounts" element={<DiscountAnalysis />} />
              <Route path="/data" element={<DataSources />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
