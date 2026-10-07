import { useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../admin";
import { PanelHeading } from "./PageUI";

const fields = [
  ["lrn", "LRN"], ["last_name", "Last name"], ["first_name", "First name"],
  ["given_name", "Middle name"], ["grade", "Grade"], ["section", "Section"], ["sex", "Sex"],
  ["full_name", "Full name"], ["grade_section", "Grade and section"],
];
const savedFields = fields.slice(0, 7);
async function readCsv(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes.length > 3 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length > 3 && bytes[0] === 0 && bytes[2] === 0) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
export default function StudentCsvImport({ onImported, onMessage }) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);
  const [options, setOptions] = useState({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [details, setDetails] = useState([]);
  const generation = useRef(0);
  async function inspect(content, nextOptions = {}) {
    const requestId = ++generation.current;
    setBusy(true); setDetails([]); onMessage(null);
    try {
      const result = await api("/admin/students/preview", { method: "POST", body: { csv: content, options: nextOptions } });
      if (requestId !== generation.current) return;
      setPreview(result);
      setOptions({ ...nextOptions, delimiter: result.delimiter, hasHeader: result.hasHeader, headerRow: result.headerRow, mapping: result.mapping, defaults: result.defaults, nameOrder: result.nameOrder });
      setDirty(false);
    } catch (error) {
      if (requestId !== generation.current) return;
      setDetails(error.details || []); onMessage({ type: "err", text: error.message }); setDirty(true);
    } finally { if (requestId === generation.current) setBusy(false); }
  }
  async function upload(event) {
    const input = event.target, file = input.files[0];
    if (!file || busy) return;
    setBusy(true); setPreview(null); setOptions({}); setDetails([]); setDirty(true); onMessage(null);
    try {
      const content = await readCsv(file);
      setCsv(content); setFileName(file.name);
      await inspect(content);
    } catch (error) { onMessage({ type: "err", text: `Unable to read file: ${error.message}` }); setBusy(false); }
    finally { input.value = ""; }
  }
  function change(next) { setOptions(next); setDirty(true); }
  function format(next) {
    // A new separator/header layout needs fresh detection; previous column indices no longer apply.
    change({ ...options, ...next, mapping: undefined, rowOverrides: {} });
  }
  function mapColumn(field, value) {
    const index = value === "" ? null : Number(value);
    const mapping = { ...options.mapping };
    if (index !== null) for (const other of Object.keys(mapping)) if (other !== field && mapping[other] === index) mapping[other] = null;
    change({ ...options, mapping: { ...mapping, [field]: index } });
  }
  function editRow(row, field, value) {
    change({ ...options, rowOverrides: { ...options.rowOverrides, [row]: { ...options.rowOverrides?.[row], [field]: value } } });
  }
  async function save() {
    if (busy || dirty || !preview?.count) return;
    setBusy(true); onMessage(null);
    try {
      const result = await api("/admin/students/upload", { method: "POST", body: { csv, options } });
      setDetails(result.details || []);
      onMessage({ type: "ok", text: `${result.count} student(s) uploaded.${result.inserted !== undefined ? ` ${result.inserted} new, ${result.updated} updated.` : ""}${result.skipped ? ` ${result.skipped} row(s) skipped; see details below.` : ""}` });
      setPreview(null); setCsv(""); setFileName(""); setOptions({});
      await onImported();
    } catch (error) { setDetails(error.details || []); onMessage({ type: "err", text: error.message }); }
    finally { setBusy(false); }
  }
  return <section className="card page-import-panel">
    <PanelHeading title="CSV upload" description="Map columns and correct data before importing CSV files in different formats." icon="download" />
    <div className="page-upload-zone"><span className="page-upload-icon"><Icon name="download" size={30} /></span><h3>Upload student list</h3><p>{busy ? "Processing CSV…" : "Select a file to preview it before saving."}</p><label className="page-file-label">Student CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={busy} onChange={upload} /></label></div>
    <p className="page-helper">Common headers, separators, full names, and grade/section fields are detected automatically. Use column mapping for other formats. A valid LRN, name, grade, and section are required.</p>
    <a className="csv-template-link" href="/student-template.csv" download><Icon name="download" size={16} />Download CSV template</a>
    {csv && <div className="csv-review">
      <h3>Review CSV</h3><p className="page-helper">{fileName}</p>
      <fieldset className="csv-controls" disabled={busy}>
        <legend>File format</legend>
        <div className="page-form-grid">
          <label>Separator<select value={options.delimiter || ""} onChange={(e) => format({ delimiter: e.target.value })}><option value="">Automatic</option><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value={'\t'}>Tab</option><option value="|">Pipe (|)</option></select></label>
          <label>First row<select value={options.headerRow || 1} onChange={(e) => format({ headerRow: Number(e.target.value) })}>{(preview?.rowChoices || [{ value: 1, label: "Row 1" }]).map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
        </div>
        <label className="csv-checkbox"><input type="checkbox" checked={options.hasHeader ?? true} onChange={(e) => format({ hasHeader: e.target.checked })} />The first row contains column headers</label>
      </fieldset>
      {preview && <>
        <p className="csv-counts" role="status"><strong>{preview.count}</strong> ready to import · <strong>{preview.skipped}</strong> incomplete or skipped · {preview.total} total records</p>
        {!!preview.warnings.length && <div className="csv-notice">{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        <fieldset className="csv-controls" disabled={busy}>
          <legend>Map columns</legend><p className="page-helper">Select the CSV column for each field. Separate first and last name columns are optional if a full name column is available.</p>
          <div className="page-form-grid">{fields.map(([field, label]) => <label key={field}>{label}<select aria-label={`CSV column for ${label}`} value={options.mapping?.[field] ?? ""} onChange={(e) => mapColumn(field, e.target.value)}><option value="">No column</option>{preview.columns.map((column) => <option key={column.index} value={column.index}>{column.index + 1}. {column.label}</option>)}</select>{options.mapping?.[field] != null && <small className="csv-samples">Example: {preview.columns[options.mapping[field]]?.samples.filter(Boolean).slice(0, 2).join(" · ")}</small>}</label>)}</div>
          {options.mapping?.full_name != null && <label className="csv-name-order">Full name order<select aria-label="Full name order" value={options.nameOrder || "first-last"} onChange={(e) => change({ ...options, nameOrder: e.target.value })}><option value="first-last">First name → Last name (Juan Dela Cruz)</option><option value="last-first">Last name → First name (Santos Juan)</option></select><small>Names containing a comma are read as Last name, First name. Correct any incorrectly split names in the preview.</small></label>}
          <h4 className="csv-default-heading">Defaults for rows without a grade or section</h4>
          <div className="page-form-grid">{[["grade", "Default grade"], ["section", "Default section"]].map(([field, label]) => <label key={field}>{label}<input value={options.defaults?.[field] || ""} onChange={(e) => change({ ...options, defaults: { ...options.defaults, [field]: e.target.value } })} /></label>)}</div>
        </fieldset>
        <h4>Preview and corrections</h4><p className="page-helper">Shows the first 20 records and up to 20 records with errors. Edit fields here, then update the preview. Other valid records are also included in the import.</p>
        <div className="page-table-scroll csv-preview-table"><table><thead><tr><th>Row</th>{savedFields.map(([field, label]) => <th key={field}>{label}</th>)}<th>Details</th></tr></thead><tbody>{preview.rows.map(({ row, student, error, raw }) => <tr key={row}><td>{row}</td>{savedFields.map(([field, label]) => <td key={field}><input aria-label={`Row ${row} ${label}`} value={options.rowOverrides?.[row]?.[field] ?? student[field]} disabled={busy} onChange={(e) => editRow(row, field, e.target.value)} /></td>)}<td><span className={error ? "csv-row-error" : "csv-row-ok"}>{error || "Ready"}</span><details><summary>Original row</summary><p>{raw.join(" | ")}</p></details></td></tr>)}</tbody></table></div>
      </>}
      {dirty && <p className="csv-notice">Update the preview to validate your changes before importing.</p>}
      <div className="page-form-actions csv-import-actions"><button className="ghost" disabled={busy} onClick={() => inspect(csv, options)}>Update preview</button><button disabled={busy || dirty || !preview?.count} onClick={save}>Import {preview?.count || 0} student(s)</button><button className="ghost" disabled={busy} onClick={() => { generation.current++; setPreview(null); setCsv(""); setOptions({}); setDetails([]); }}>Cancel CSV</button></div>
      {!!preview?.details.length && <div className="msg err" role="alert"><strong>Rows that need corrections:</strong><ul>{preview.details.map((detail) => <li key={detail.row}>Row {detail.row}: {detail.error}</li>)}</ul></div>}
    </div>}
    {!!details.length && <div className="msg err" role="alert"><strong>Rows not imported (up to 20):</strong><ul>{details.map((detail) => <li key={detail.row}>Row {detail.row}: {detail.error}</li>)}</ul></div>}
  </section>;
}
