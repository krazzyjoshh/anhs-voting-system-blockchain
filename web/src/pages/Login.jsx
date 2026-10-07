import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AdminBrand, Icon } from "../admin";
export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await api("/admin/login", { method: "POST", body: { email: email.trim(), password } });
      localStorage.setItem("adminToken", data.token); nav("/admin", { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="admin-login-page"><div className="admin-login-layout">
    <section className="admin-login-welcome"><AdminBrand /><div className="admin-login-intro"><span className="admin-pill">Election Management Portal</span><h1>A well-organized election.<br /><span>Clear election management.</span></h1><p>Manage voters, candidates, and election results at Agusan National High School.</p>
      <div className="admin-login-feature"><span><Icon name="shield" size={25} /></span><div><strong>Admin access</strong><p>For authorized election administrators.</p></div></div></div><Link className="admin-back-public" to="/"><Icon name="arrow" size={18} />Back to public page</Link></section>
    <section className="admin-login-card"><span className="admin-login-lock"><Icon name="lock" size={27} /></span><div className="admin-report-eyebrow">OFFICIAL CONSOLE</div><h2>Welcome back, Admin</h2><p>Log in with your admin email and password.</p>
      <form onSubmit={submit}>{error && <div className="admin-error" role="alert">{error}</div>}
        <label htmlFor="admin-email">Email address</label><div className="admin-login-input"><Icon name="person" size={19} /><input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter admin email" /></div>
        <label htmlFor="admin-password">Password</label><div className="admin-login-input"><Icon name="lock" size={19} /><input id="admin-password" type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" /><button type="button" className="admin-icon-button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name="eye" size={19} /></button></div>
        <button className="admin-button primary admin-login-submit" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}<Icon name={busy ? "refresh" : "arrow"} size={18} className={busy ? "is-spinning" : ""} /></button>
      </form><div className="admin-login-note"><Icon name="shield" size={16} /><span>A valid admin account is required to sign in.</span></div>
    </section></div><small className="admin-login-copyright">ANHS Vote • Student Leadership Election Portal</small></div>;
}
