import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AdminPage from "./pages/AdminPage";
import DisplayPage from "./pages/DisplayPage";

function Nav() {
  const { t } = useTranslation();
  const loc = useLocation();
  const isDisplay = loc.pathname.startsWith("/display");
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
      <div className="container" style={{ paddingTop: 10, paddingBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <Link className="btn" to="/">{t("nav.admin")}</Link>
        <Link className="btn" to="/display">{t("nav.bigPicture")}</Link>
        <div style={{ flex: 1 }} />
        <span className="muted">{isDisplay ? t("nav.displayMode") : t("nav.adminMode")}</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/" element={<AdminPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </div>
  );
}
