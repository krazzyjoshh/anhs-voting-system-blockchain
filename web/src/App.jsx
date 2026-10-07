import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { api, getToken, logout } from "./api";
import { AdminSession } from "./admin";
import AdminShell from "./components/AdminShell.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Students from "./pages/Students.jsx";
import Candidates from "./pages/Candidates.jsx";
import Tokens from "./pages/Tokens.jsx";
import TokensPrint from "./pages/TokensPrint.jsx";
import Blockchain from "./pages/Blockchain.jsx";
import Vote from "./pages/Vote.jsx";
import Home from "./pages/Home.jsx";
import Verify from "./pages/Verify.jsx";
import Ledger from "./pages/Ledger.jsx";

function Guard() {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (!getToken()) { setReady(true); return; }
    api("/admin/me", { redirectOnUnauthorized: false }).then((profile) => {
      if (!profile?.id || !profile?.email) throw new Error("Invalid admin session");
      if (active) setAdmin(profile);
    }).catch(() => { if (active) logout(); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  if (!getToken() || ready && !admin) return <Navigate to="/admin/login" replace />;
  if (!ready) return <div className="admin-session-loading" role="status">Checking admin session…</div>;
  return <AdminSession.Provider value={admin}><Outlet /></AdminSession.Provider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/vote/*" element={<Vote />} />
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<Login />} />
        <Route element={<Guard />}>
          <Route path="/admin/tokens/print" element={<TokensPrint />} />
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="system" element={<Navigate to="/admin/blockchain" replace />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="students" element={<Students />} />
            <Route path="candidates" element={<Candidates />} />
            <Route path="tokens" element={<Tokens />} />
            <Route path="blockchain" element={<Blockchain />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
