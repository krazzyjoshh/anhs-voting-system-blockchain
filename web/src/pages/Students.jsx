import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Msg } from "../ui";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { Icon } from "../admin";
import { PageHeading, SummaryCards, PanelHeading, EmptyState, NameAvatar } from "../components/PageUI";
import StudentCsvImport from "../components/StudentCsvImport";

const empty = { lrn: "", last_name: "", first_name: "", given_name: "", grade: "Grade 7", section: "", sex: "Male" };

export default function Students() {
  const { stats } = useOutletContext();
  const [params] = useSearchParams();
  const querySearch = params.get("search") || "";
  const [data, setData] = useState({ students: [], sections: [] });
  const [f, setF] = useState({ search: querySearch, grade: "", section: "", status: "", active: "" });
  const [form, setForm] = useState(empty);
  const [m, setM] = useState(null);

  useEffect(() => { setF((current) => ({ ...current, search: querySearch })); }, [querySearch]);

  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    setData(await api(`/admin/students?${q}`));
  }, [f]);

  useEffect(() => {
    load().catch((e) => setM({ type: "err", text: e.message }));
  }, [load]);

  async function run(fn, ok) {
    try {
      const r = await fn();
      setM({ type: "ok", text: typeof ok === "function" ? ok(r) : ok });
      await load();
      return true;
    } catch (e) {
      setM({ type: "err", text: e.message });
      return false;
    }
  }

  const grades = [...new Set(data.sections.map((s) => s.grade))];
  const sections = [...new Set(data.sections.filter((s) => !f.grade || s.grade === f.grade).map((s) => s.section))];
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (await run(() => api("/admin/students", { method: "POST", body: form }), "Student added.")) setForm(empty);
  }

  return <div className="admin-content students-page">
    <PageHeading title="Students" subtitle="Manage registered voters at Agusan National High School." icon="people" />
    <Msg m={m} />
    <SummaryCards items={[
      {label:"Registered students", value:stats?.students, detail:"All student records", icon:"people"},
      {label:"Active students", value:stats?.activeStudents, detail:"Eligible voters", icon:"check"},
      {label:"Students voted", value:stats?.voted, detail:"Completed votes", icon:"ballot"},
    ]} />
    <div className="page-two-columns">
      <form className="card" onSubmit={add}>
        <PanelHeading title="Add student" description="Enter the new voter’s information." icon="people" />
        <div className="page-form-grid">
          <label>LRN<input placeholder="LRN" required value={form.lrn} onChange={setField("lrn")} /></label>
          <label>Last name<input placeholder="Last name" required value={form.last_name} onChange={setField("last_name")} /></label>
          <label>First name<input placeholder="First name" required value={form.first_name} onChange={setField("first_name")} /></label>
          <label>Given / Middle name<input placeholder="Given/Middle name" value={form.given_name} onChange={setField("given_name")} /></label>
          <label>Grade<input placeholder="Grade (e.g. Grade 7)" required value={form.grade} onChange={setField("grade")} /></label>
          <label>Section<input placeholder="Section" required value={form.section} onChange={setField("section")} /></label>
          <label>Sex<select aria-label="Student sex" value={form.sex} onChange={setField("sex")}><option>Male</option><option>Female</option></select></label>
        </div><div className="page-form-actions"><button type="submit"><Icon name="people" size={16} />Add</button></div>
      </form>
      <StudentCsvImport onImported={load} onMessage={setM} />
    </div>
    <section className="card page-table-panel">
      <PanelHeading title="Student directory" description="Search and filter voters." icon="ledger"><span className="admin-pill">{data.students.length} shown</span></PanelHeading>
      <div className="page-filters">
        <div className="page-search-field"><Icon name="search" size={18} /><input aria-label="Student search" placeholder="Search by name or LRN" value={f.search} onChange={setFilter("search")} /></div>
        <select aria-label="Filter grade" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, section: "" })}><option value="">All grades</option>{grades.map((g) => <option key={g}>{g}</option>)}</select>
        <select aria-label="Filter section" value={f.section} onChange={setFilter("section")}><option value="">All sections</option>{sections.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Filter voting status" value={f.status} onChange={setFilter("status")}><option value="">All voting statuses</option><option value="voted">Voted</option><option value="not">Not yet</option></select>
        <select aria-label="Filter student status" value={f.active} onChange={setFilter("active")}><option value="">All student statuses</option><option value="1">Active</option><option value="0">Inactive</option></select>
      </div>
      <div className="page-table-scroll"><table><thead><tr><th>LRN</th><th>Name</th><th>Grade</th><th>Section</th><th>Sex</th><th>Student status</th><th>Voted</th><th>Action</th></tr></thead><tbody>
        {data.students.map((s) => <tr key={s.id}><td className="page-lrn">{s.lrn}</td><td><div className="page-person-cell"><NameAvatar name={`${s.first_name} ${s.last_name}`} /><strong>{s.last_name}, {s.first_name} {s.given_name ?? ""}</strong></div></td><td>{s.grade}</td><td>{s.section}</td><td>{s.sex}</td>
          <td><span className={`badge ${s.active ? "unused" : "used"}`}>{s.active ? "Active" : "Inactive"}</span></td><td><span className={`badge ${s.has_voted ? "used" : "unused"}`}>{s.has_voted ? "Yes" : "No"}</span></td>
          <td><button className="ghost small" onClick={() => run(() => api(`/admin/students/${s.id}/active`, { method: "PATCH", body: { active: !s.active } }), s.active ? "Student marked inactive; voting is blocked." : "Student marked active.")}>{s.active ? "Set inactive" : "Set active"}</button></td></tr>)}
      </tbody></table></div>
      {!data.students.length && <EmptyState title="No students to display" description="Add a student or adjust the filters." icon="people" />}
      <p className="page-table-note">Showing the first 500 matching records.</p>
    </section>
  </div>;
}
