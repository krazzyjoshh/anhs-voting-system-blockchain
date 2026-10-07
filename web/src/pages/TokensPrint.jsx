import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function TokensPrint() {
  const [sp] = useSearchParams();
  const [tokens, setTokens] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ status: "unused", ...Object.fromEntries(sp) });
    api(`/admin/tokens?${q}`).then((d) => setTokens(d.tokens)).catch((e) => setErr(e.message));
  }, [sp]);

  return (
    <div style={{ padding: 20 }}>
      <div className="no-print row">
        <button onClick={() => window.print()}>Print</button>
        <span>{tokens.length} token(s)</span>
        {err && <span className="msg err">{err}</span>}
      </div>
      <div className="print-grid">
        {tokens.map((t) => (
          <div className="ticket" key={t.id}>
            <b>{t.last_name ? `${t.last_name}, ${t.first_name}` : "—"}</b>
            <br /><small>{t.grade} {t.section ?? ""}</small>
            <div className="code mono">{t.code}</div>
            <small>ANHS Voting System. Single use only. Do not share with others.</small>
          </div>
        ))}
      </div>
    </div>
  );
}
