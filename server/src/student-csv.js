const { parse } = require("csv-parse/sync");
const required = ["lrn", "last_name", "first_name", "grade", "section"];
const studentFields = [...required, "given_name", "sex"];
const fields = [...studentFields, "full_name", "grade_section"];
const aliases = {
  lrn: ["learner reference number", "learner reference no", "learner reference", "student lrn", "student id", "student number", "learner id", "id"],
  last_name: ["lastname", "surname", "family name", "apelyido"],
  first_name: ["firstname", "first names", "given names", "unang pangalan"],
  given_name: ["given name", "middle name", "middlename", "middle initial", "mi", "given middle name"],
  full_name: ["fullname", "name", "student name", "student", "learner name", "name of learner", "name of student", "pangalan"],
  grade: ["grade level", "gradelevel", "year level", "year", "baitang", "level"],
  section: ["class", "class section", "seksyon", "pangkat"],
  sex: ["gender", "kasarian"],
  grade_section: ["grade and section", "grade & section", "year section"],
};
const clean = (value) => String(value ?? "").trim();
const key = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const headerAliases = new Map(Object.entries(aliases).flatMap(([field, names]) => [field, ...names].map((name) => [key(name), field])));
function invalid(message, details = []) { throw Object.assign(new Error(message), { status: 400, details }); }
function text(value) { return clean(value).replace(/\s+/g, " "); }
function grade(value) {
  const valueText = text(value), match = valueText.match(/^(?:grade|gr\.?|g|year)?\s*(\d{1,2})$/i);
  return match ? `Grade ${Number(match[1])}` : valueText;
}
function sex(value) {
  const valueText = text(value);
  if (/^(m|male|lalaki)$/i.test(valueText)) return "Male";
  if (/^(f|female|babae)$/i.test(valueText)) return "Female";
  return valueText || "Male";
}
function splitName(value, order) {
  const name = text(value);
  if (!name) return {};
  if (name.includes(",")) {
    const [last, ...first] = name.split(",");
    return { last_name: text(last), first_name: text(first.join(" ")) };
  }
  const parts = name.split(" ");
  if (parts.length < 2) return { first_name: name, last_name: "" };
  if (order === "last-first") return { last_name: parts.shift(), first_name: parts.join(" ") };
  // Keep given names together rather than guessing which one is a middle name.
  const surname = name.match(/\s((?:de la|de los|dela|del|de|van|von)\s+\S+(?:\s+(?:jr\.?|sr\.?|ii|iii|iv))?)$/i);
  if (surname) return { first_name: name.slice(0, surname.index), last_name: surname[1] };
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts.at(-1)) ? parts.pop() : "";
  const last = parts.pop();
  return { first_name: parts.join(" "), last_name: [last, suffix].filter(Boolean).join(" ") };
}
function inspectStudentsCsv(csv, options = {}) {
  if (!clean(csv)) invalid("The CSV is empty.");
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid("Invalid CSV options.");
  const separators = [",", ";", "\t", "|"];
  let lineOffset = 0;
  const directive = csv.replace(/^\uFEFF/, "").match(/^sep=([,;\t|])\r?\n/i);
  if (directive) { csv = csv.replace(/^\uFEFF/, "").slice(directive[0].length); lineOffset = 1; }
  if (options.delimiter && !separators.includes(options.delimiter)) invalid("Invalid CSV separator.");
  let best;
  for (const delimiter of options.delimiter ? [options.delimiter] : directive ? [directive[1]] : separators) {
    try {
      const records = parse(csv, { delimiter, bom: true, skip_empty_lines: true, trim: true, info: true, relax_column_count: true });
      if (!records.length) continue;
      let headerIndex = 0, headerScore = 0;
      records.slice(0, 20).forEach(({ record }, index) => {
        const score = new Set(record.map((value) => headerAliases.get(key(value))).filter(Boolean)).size;
        if (score > headerScore) { headerIndex = index; headerScore = score; }
      });
      const widths = records.slice(headerIndex, headerIndex + 10).map(({ record }) => record.length), width = Math.max(...widths);
      const score = headerScore * 100 + (width > 1 ? 10 : 0) + widths.filter((n) => n === width).length / widths.length;
      if (!best || score > best.score) best = { records, delimiter, headerIndex, headerScore, score };
    } catch { /* Try the next separator; invalid quoting is not silently repaired. */ }
  }
  if (!best) invalid("Unable to read the CSV. Check the file’s quotation marks and separator.");
  const { records, delimiter } = best;
  const hasHeader = options.hasHeader === undefined ? best.headerScore > 0 : Boolean(options.hasHeader);
  const headerIndex = options.headerRow === undefined ? best.headerIndex : Number(options.headerRow) - 1;
  if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= records.length) invalid("Invalid first row for the CSV.");
  const sourceHeaders = hasHeader ? records[headerIndex].record : [], dataRows = records.slice(headerIndex + (hasHeader ? 1 : 0));
  const width = hasHeader ? sourceHeaders.length : records.slice(headerIndex).reduce((n, row) => Math.max(n, row.record.length), 0);
  const columns = Array.from({ length: width }, (_, index) => ({ index, label: sourceHeaders[index] || `Column ${index + 1}`, samples: dataRows.slice(0, 3).map(({ record }) => record[index] || "") }));
  const warnings = [], detected = Object.fromEntries(fields.map((field) => [field, null]));
  sourceHeaders.forEach((value, index) => {
    const field = headerAliases.get(key(value));
    if (!field) return;
    if (detected[field] !== null) warnings.push(`More than one column matches ${field}. Select the correct column in the mapping.`);
    else detected[field] = index;
  });
  const mapping = { ...detected, ...(options.mapping || {}) };
  for (const field of Object.keys(mapping)) {
    const index = mapping[field];
    if (!fields.includes(field) || (index !== null && (!Number.isInteger(index) || index < 0 || index >= width))) invalid(`Invalid column mapping for ${field}.`);
  }
  const used = Object.values(mapping).filter((index) => index !== null);
  if (new Set(used).size !== used.length) invalid("Use a different CSV column for each field.");
  const defaults = { grade: grade(options.defaults?.grade), section: text(options.defaults?.section), sex: sex(options.defaults?.sex) };
  const nameOrder = options.nameOrder || "first-last";
  if (!["first-last", "last-first"].includes(nameOrder)) invalid("Invalid name order.");
  if (!hasHeader) warnings.push("No header was detected. Map each column to the correct student field.");
  if (mapping.full_name !== null) warnings.push("Full names were split. Review first and last names before importing; you can correct them in the preview.");
  if (mapping.grade_section !== null) warnings.push("Grade and section were split from a single column. Review the preview.");
  if (width === 1) warnings.push("Only one column was read. Try another separator if the file contains separate fields.");
  const rowOverrides = options.rowOverrides || {}, students = [], details = [], normalized = [];
  let skipped = 0;
  for (const { record, info } of dataRows) {
    if (record.every((value) => !clean(value))) continue;
    const rowNumber = info.lines + lineOffset, override = rowOverrides[rowNumber] || {};
    if (override.skip) { skipped++; details.push({ row: rowNumber, error: "Skipped by request." }); continue; }
    const student = Object.fromEntries(studentFields.map((field) => [field, mapping[field] === null ? "" : text(record[mapping[field]])]));
    if (mapping.full_name !== null) {
      const name = splitName(record[mapping.full_name], nameOrder);
      student.first_name ||= name.first_name || ""; student.last_name ||= name.last_name || "";
    }
    if (mapping.grade_section !== null) {
      const value = text(record[mapping.grade_section]);
      const combined = value.match(/^(?:grade|gr\.?|g|year)?\s*(\d{1,2})(?:\s*[-/–:]\s*|\s+|(?=[A-Za-z]))(.+)$/i);
      if (combined) { student.grade ||= combined[1]; student.section ||= text(combined[2]); }
    }
    student.grade ||= defaults.grade; student.section ||= defaults.section; student.sex ||= defaults.sex;
    for (const field of studentFields) if (Object.hasOwn(override, field)) student[field] = text(override[field]);
    student.grade = grade(student.grade); student.sex = sex(student.sex);
    student.lrn = student.lrn.replace(/^="([^"]+)"$/, "$1").replace(/^'(\d+)$/, "$1");
    if (/^[\d\s-]+$/.test(student.lrn)) student.lrn = student.lrn.replace(/[\s-]/g, "");
    const missing = required.filter((field) => !student[field]);
    let error = missing.length ? `Missing ${missing.join(", ")}.` : "";
    if (record.length > width && record.slice(width).some((value) => clean(value))) error = "The row has extra values. Check the separator or add quotes around names containing commas.";
    if (/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(student.lrn)) error = "The LRN is in scientific notation. Enter the full LRN in the preview.";
    normalized.push({ row: rowNumber, student, error, raw: record });
    if (error) { skipped++; details.push({ row: rowNumber, error }); }
    else students.push(student);
  }
  if (!dataRows.length) warnings.push("The CSV contains only headers. Add student records before importing.");
  const previewRows = [...normalized.slice(0, 20), ...normalized.filter((row) => row.error).slice(0, 20)].filter((row, index, rows) => rows.findIndex((other) => other.row === row.row) === index);
  return { students, columns, mapping, defaults, nameOrder, hasHeader, headerRow: headerIndex + 1, delimiter, warnings, rows: previewRows, count: students.length, skipped, total: students.length + skipped, details: details.slice(0, 20), rowChoices: records.slice(0, 20).map(({ record, info }, index) => ({ value: index + 1, label: `Row ${info.lines + lineOffset}: ${record.join(" | ").slice(0, 120)}` })) };
}
function parseStudentsCsv(csv, options = {}) {
  const result = inspectStudentsCsv(csv, options);
  if (!options.mapping && result.warnings.some((warning) => warning.startsWith("More than one column matches"))) invalid("Duplicate CSV columns. Select the correct columns in the preview.");
  if (!result.count) invalid(result.total ? "No students were imported. Complete or correct the required fields in the preview." : "The CSV contains no student records. If it contains only headers, add records first.", result.details);
  return result;
}
module.exports = { parseStudentsCsv, inspectStudentsCsv };
