const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseStudentsCsv, inspectStudentsCsv } = require("../src/student-csv");

test("student CSV accepts existing format, Excel BOM and friendly header names", () => {
  const csv = '\uFEFFLRN,Last Name,First Name,Middle Name,Grade Level,Section,Gender\r\n001234567890,"Dela Cruz, Jr.",Juan,Santos,Grade 7,Rizal,Male';
  const result = parseStudentsCsv(csv);
  assert.deepEqual(result.students, [{ lrn: "001234567890", last_name: "Dela Cruz, Jr.", first_name: "Juan", given_name: "Santos", grade: "Grade 7", section: "Rizal", sex: "Male" }]);
  assert.equal(result.skipped, 0);
  assert.equal(parseStudentsCsv("lrn,last_name,first_name,grade,section\n01,Example,Student,Grade 7,A").students[0].sex, "Male");
});
test("student CSV accepts semicolon and tab exports without splitting quoted values", () => {
  for (const delimiter of [";", "\t"]) {
    const csv = [["Learner Reference Number", "Surname", "FirstName", "Grade", "Section"], ["02", '"Example; Family"', "Student", "Grade 8", "B"]].map((row) => row.join(delimiter)).join("\n");
    assert.equal(parseStudentsCsv(csv).students[0].last_name, "Example; Family");
  }
});
test("student CSV reports missing information and rejects ambiguous headers or malformed quoting", () => {
  assert.throws(() => parseStudentsCsv("Full Name,Grade,Section\nStudent Example,Grade 7,A"), (error) => error.details[0].error.includes("lrn"));
  assert.throws(() => parseStudentsCsv("lrn,LRN,last_name,first_name,grade,section\n01,01,Example,Student,Grade 7,A"), /Duplicate CSV columns/);
  assert.throws(() => parseStudentsCsv("lrn,last_name,first_name,grade,section\n01,Example,Student,Grade 7"), (error) => error.details[0].error.includes("section"));
  assert.throws(() => parseStudentsCsv('lrn,last_name,first_name,grade,section\n01,"Unclosed,Student,Grade 7,A'), /Unable to read/);
});
test("student CSV gives row diagnostics instead of a successful zero count", () => {
  const header = "lrn,last_name,first_name,grade,section\n";
  const partial = parseStudentsCsv(header + "01,Example,Student,Grade 7,A\n02,Missing,,Grade 7,B\n,,,,");
  assert.equal(partial.students.length, 1); assert.equal(partial.skipped, 1);
  assert.deepEqual(partial.details, [{ row: 3, error: "Missing first_name." }]);
  assert.throws(() => parseStudentsCsv(header + "02,Missing,,Grade 7,B"), (error) => {
    assert.equal(error.status, 400); assert.equal(error.details[0].row, 2);
    assert.match(error.message, /No students were imported/); return true;
  });
  assert.throws(() => parseStudentsCsv(header), /only headers/i);
  assert.throws(() => parseStudentsCsv(""), /CSV is empty/);
});

test("full names, combined grade/section, shuffled and Filipino headers normalize in preview", () => {
  const result = inspectStudentsCsv('Kasarian|Pangalan|LRN|Grade & Section|Unused\nf|Juan Santos Dela Cruz|000123456789|7-Rizal|extra\nM|"Reyes, Maria Lopez"|000123456790|Grade 8 / Bonifacio|extra');
  assert.equal(result.delimiter, "|"); assert.equal(result.count, 2);
  assert.deepEqual(result.students[0], { lrn: "000123456789", last_name: "Dela Cruz", first_name: "Juan Santos", given_name: "", grade: "Grade 7", section: "Rizal", sex: "Female" });
  assert.equal(result.students[1].last_name, "Reyes"); assert.equal(result.students[1].first_name, "Maria Lopez");
  assert.equal(result.students[1].section, "Bonifacio");
  assert.ok(result.warnings.some((warning) => warning.includes("Full names")));
});

test("Excel separator directives and title rows are detected without importing headings", () => {
  const result = inspectStudentsCsv('sep=;\nSchool list 2026\n\nSection;LRN;First Name;Last Name;Grade\nA;00123;Juan;Santos;7');
  assert.equal(result.count, 1); assert.equal(result.delimiter, ";"); assert.equal(result.rows[0].row, 5);
  assert.equal(result.students[0].lrn, "00123"); assert.equal(result.students[0].grade, "Grade 7");
});
test("combined grade separators and spaces/hyphens in numeric LRNs normalize consistently", () => {
  for (const value of ["Grade 7 -Rizal", "7 /Rizal", "7-Rizal", "7 Rizal", "7Rizal"]) {
    const result = parseStudentsCsv(`LRN,Full Name,Grade and Section\n000 123-456 789,Juan Santos,${value}`);
    assert.equal(result.students[0].lrn, "000123456789");
    assert.equal(result.students[0].grade, "Grade 7"); assert.equal(result.students[0].section, "Rizal");
  }
});

test("unknown headers and headerless files accept explicit mapping and shared defaults", () => {
  const csv = "Identifier,Label,Group\n00123,Santos Juan,A\n00124,Reyes Ana,B";
  const initial = inspectStudentsCsv(csv); assert.equal(initial.count, 0); assert.equal(initial.hasHeader, false);
  const options = { hasHeader: true, headerRow: 1, mapping: { lrn: 0, full_name: 1, section: 2 }, nameOrder: "last-first", defaults: { grade: "8" } };
  const mapped = parseStudentsCsv(csv, options); assert.equal(mapped.count, 2);
  assert.equal(mapped.students[0].first_name, "Juan"); assert.equal(mapped.students[0].last_name, "Santos"); assert.equal(mapped.students[0].grade, "Grade 8");
  const headerless = parseStudentsCsv("00123|Juan Santos|A\n00124|Ana Reyes|B", { hasHeader: false, headerRow: 1, delimiter: "|", mapping: { lrn: 0, full_name: 1, section: 2 }, defaults: { grade: "Grade 7" } });
  assert.equal(headerless.count, 2); assert.equal(headerless.students[0].first_name, "Juan");
});

test("row edits repair missing information without inventing LRNs, and repeat on import", () => {
  const csv = "Name,Grade\nJuan Santos,7\nAna Reyes,8";
  const preview = inspectStudentsCsv(csv); assert.equal(preview.count, 0);
  const options = { mapping: preview.mapping, defaults: { section: "A" }, rowOverrides: { 2: { lrn: "000000000001", first_name: "Juan Carlos" }, 3: { lrn: "000000000002", section: "B" } } };
  const fixed = inspectStudentsCsv(csv, options); assert.equal(fixed.count, 2); assert.equal(fixed.students[0].first_name, "Juan Carlos");
  assert.deepEqual(parseStudentsCsv(csv, options).students, fixed.students);
});

test("ragged optional cells are padded but ambiguous extra values are flagged", () => {
  const csv = "lrn,last_name,first_name,grade,section,sex\n01,Santos,Juan,7,A\n02,Reyes,Ana,8,B,F,unexpected";
  const result = inspectStudentsCsv(csv); assert.equal(result.count, 1); assert.equal(result.skipped, 1);
  assert.equal(result.students[0].sex, "Male"); assert.match(result.details[0].error, /extra values/);
});

test("invalid mapping is rejected and quoted Excel LRNs preserve leading zeros", () => {
  const csv = "LRN,Full Name,Grade,Section\n'00123,Juan Santos,7,A";
  assert.equal(parseStudentsCsv(csv).students[0].lrn, "00123");
  assert.throws(() => inspectStudentsCsv(csv, { mapping: { lrn: 1, full_name: 1 } }), /different CSV column/);
  assert.throws(() => inspectStudentsCsv(csv, { mapping: { lrn: 99 } }), /mapping/);
  assert.throws(() => inspectStudentsCsv(csv, { headerRow: 99 }), /first row/);
  const scientific = inspectStudentsCsv("LRN,Full Name,Grade,Section\n1.23E+11,Juan Santos,7,A");
  assert.equal(scientific.count, 0); assert.match(scientific.details[0].error, /scientific notation/);
});
