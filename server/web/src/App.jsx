import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState("Checking...");
  const [email, setEmail] = useState("admin@anhs.local");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? "Online ✔" : "Service issue"))
      .catch(() => setHealth("Unable to reach the server ✘"));
  }, []);

  async function login(e) {
    e.preventDefault();
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    localStorage.setItem("adminToken", d.token);
    setMsg("Logged in as " + d.email);
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1>ANHS Blockchain Voting</h1>
      <p>Server: <b>{health}</b></p>
      <form onSubmit={login} style={{ display: "grid", gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button type="submit">Admin Login</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}