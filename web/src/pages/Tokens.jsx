import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";
import { useOutletContext } from "react-router-dom";
import { Icon } from "../admin";
import { PageHeading, SummaryCards, PanelHeading, EmptyState, NameAvatar } from "../components/PageUI";

export default function Tokens() {
  const { stats } = useOutletContext();
  const [data, setData] = useState({ tokens: [], unused: 0, sections: [] });
  const [students, setStudents] = useState([]);
  const [f, setF] = useState({ grade: "", section: "", status: "", active: "" });
  const [g, setG] = useState({ mode: "grade", student_id: "", grade: "", section: "" });
  const [m, setM] = useState(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setData(await api(`/admin/tokens?${q}`));
  }, [f]);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
  }, [load]);

  useEffect(() => {
    api("/admin/students").then((d) => setStudents(d.students)).catch(() => {});
  }, []);

  async function run(fn, ok) {
    try {
      const r = await fn();
      setM({ type: "ok", text: typeof ok === "function" ? ok(r) : ok });
      await load();
    } catch (e) {
      setM({ type: "err", text: e.message });
    }
  }

  const grades = [...new Set(data.sections.map((s) => s.grade))];
  const gSections = [...new Set(data.sections.filter((s) => !g.grade || s.grade === g.grade).map((s) => s.section))];
  const fSections = [...new Set(data.sections.filter((s) => !f.grade || s.grade === f.grade).map((s) => s.section))];
  const printQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

  return (
    <div className="admin-content tokens-page">
      <PageHeading title="Tokens" subtitle="Manage voting tokens and prepare tickets for voters." icon="key"><a className="admin-button secondary" href={`/admin/tokens/print?${printQuery}`} target="_blank" rel="noreferrer"><Icon name="ledger" size={16} />Print</a></PageHeading>
      <SummaryCards items={[
        {label:"Issued tokens", value:stats?.tokens, detail:"Voting tokens in the system", icon:"key"},
        {label:"Used tokens", value:stats?.usedTokens, detail:"Already used to vote", icon:"check"},
        {label:"Unused tokens", value:stats ? stats.tokens-stats.usedTokens : null, detail:"Not yet used", icon:"ballot"},
      ]} />
      <Msg m={m} />

      <div className="card grid">
        <PanelHeading title="Generate tokens" description="Select a grade, section, or individual student." icon="key" />
        <div className="row">
          <select aria-label="Generate mode" value={g.mode} onChange={(e) => setG({ ...g, mode: e.target.value })}>
            <option value="grade">Entire grade or section</option>
            <option value="name">Individual student</option>
          </select>

          {g.mode === "grade" ? (
            <>
              <select aria-label="Generate grade" value={g.grade} onChange={(e) => setG({ ...g, grade: e.target.value, section: "" })}>
                <option value="">Select a grade</option>{grades.map((x) => <option key={x}>{x}</option>)}
              </select>
              <select aria-label="Generate section" value={g.section} onChange={(e) => setG({ ...g, section: e.target.value })}>
                <option value="">All sections</option>{gSections.map((x) => <option key={x}>{x}</option>)}
              </select>
            </>
          ) : (
            <select aria-label="Generate student" value={g.student_id} onChange={(e) => setG({ ...g, student_id: e.target.value })}>
              <option value="">Select a student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.grade} {s.section})</option>)}
            </select>
          )}

          <button onClick={() => run(() => api("/admin/tokens/generate", { method: "POST", body: g }), (r) => `${r.created} token(s) generated.`)}>
            Generate
          </button>
        </div>
        <small style={{ color: "#6b7280" }}>One token per student. Tokens cannot be generated after publishing to the blockchain.</small>
      </div>

      <section className="card page-table-panel"><PanelHeading title="Voting token directory" description="Filter tokens by grade, section, and status." icon="ledger"><span className="admin-pill">{data.tokens.length} shown</span></PanelHeading>
      <div className="page-filters">
        <select aria-label="Filter token grade" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, section: "" })}>
          <option value="">All grades</option>{grades.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select aria-label="Filter token section" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
          <option value="">All sections</option>{fSections.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select aria-label="Filter token usage" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">All</option><option value="unused">Unused</option><option value="used">Used</option>
        </select>
        <select aria-label="Filter token student status" value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })}>
          <option value="">Active and inactive</option><option value="1">Active students</option><option value="0">Inactive students</option>
        </select>


      </div>

      <div className="page-table-scroll"><table>
        <thead><tr><th>Student</th><th>Grade</th><th>Section</th><th>Student status</th><th>Token</th><th>Status</th></tr></thead>
        <tbody>
          {data.tokens.map((t) => (
            <tr key={t.id}>
              <td><div className="page-person-cell"><NameAvatar name={`${t.first_name || ""} ${t.last_name || ""}`} /><strong>{t.last_name ? `${t.last_name}, ${t.first_name}` : "—"}</strong></div></td>
              <td>{t.grade}</td><td>{t.section ?? ""}</td>
              <td>{t.student_active === null ? "—" : <span className={`badge ${t.student_active ? "unused" : "used"}`}>{t.student_active ? "Active" : "Inactive"}</span>}</td>
              <td className="mono">{t.code}</td>
              <td><span className={`badge ${t.used ? "used" : "unused"}`}>{t.used ? "Used" : "Unused"}</span></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {!data.tokens.length && <EmptyState title="No tokens to display" description="Generate tokens or adjust the filters." icon="key" />}
      </section>
    </div>
  );
}
