const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { DatabaseSync } = require("node:sqlite");
const { parseWorkbook, importRows } = require("../excel-import");
async function original() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("T10");
  ws.mergeCells("B1:M1");
  ws.getCell("B1").value = "Hàng Nhập";
  ws.mergeCells("N1:AA1");
  ws.getCell("N1").value = "Hàng Xuất";
  ws.mergeCells("AB1:AM1");
  ws.getCell("AB1").value = "Tờ khai C11";
  ws.getCell("A2").value = "Ngày XN";
  ws.mergeCells("A3:A5");
  ws.getCell("A3").value = new Date("2026-10-01T00:00:00Z");
  ws.getCell("A3").numFmt = "dd/mm/yyyy";
  for (const row of [3, 4]) {
    ws.getCell(`B${row}`).value = "KH NHẬP";
    ws.getCell(`C${row}`).value = 123456;
    ws.getCell(`C${row}`).numFmt = "000000000000";
    ws.getCell(`E${row}`).value = "00046962";
    ws.getCell(`H${row}`).value = row === 3;
  }
  for (const [col, v] of [
    ["J", 20],
    ["K", "PP"],
    ["L", 5920.8],
  ]) {
    ws.mergeCells(`${col}3:${col}4`);
    ws.getCell(`${col}3`).value = v;
  }
  ws.getCell("N3").value = "KH XUẤT";
  ws.getCell("O3").value = "SUMIDENSO";
  ws.getCell("S3").value = 4;
  ws.getCell("T3").value = true;
  ws.getCell("V3").value = 3;
  ws.getCell("X3").value = 25.5;
  ws.getCell("AB3").value = "KH NHÁP KHÁC";
  ws.getCell("AC3").value = "BILL-NHAP";
  ws.getCell("AD3").value = new Date("1899-12-30T08:33:00Z");
  ws.getCell("AD3").numFmt = "h:mm";
  ws.getCell("AE3").value = "OK";
  ws.getCell("AH3").value = "KH TRUYỀN KHÁC";
  ws.getCell("AI3").value = "BILL-TRUYEN";
  ws.getCell("AJ3").value = new Date("1899-12-30T14:24:00Z");
  ws.getCell("AJ3").numFmt = "h:mm";
  ws.getCell("AK3").value = "00108742005960";
  ws.getCell("AM3").value = "OK";
  ws.getCell("H5").value = false;
  ws.getCell("U5").value = false;
  ws.getCell("R5").value = " ";
  ws.getCell("T6").value = true;
  return { wb, ws };
}
test("T10: 3 khối độc lập, C11 tách nháp/truyền, ô gộp không nhân số, mã/giờ/ô trống", async () => {
  const { wb } = await original();
  const result = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    inbound: 2,
    outbound: 1,
    draft: 1,
    transmit: 1,
  });
  assert.equal(result.rows.length, 5);
  const ins = result.rows.filter((r) => r.direction === "Nhập");
  assert.equal(ins[0].packages, "20");
  assert.equal(ins[1].packages, "");
  assert.equal(
    ins.reduce((s, r) => s + Number(r.weight), 0),
    5920.8,
  );
  assert.match(ins[1].sharedCells, /J3:J4/);
  assert.equal(ins[1].date, "2026-10-01");
  assert.equal(ins[0].declaration, "000000123456");
  assert.equal(ins[0].invoice, "00046962");
  assert.equal(ins[1].status, "Chờ xử lý");
  assert.equal(ins[0].status, "Hoàn tất");
  assert.equal(ins[0].slips, "");
  const out = result.rows.find((r) => r.direction === "Xuất");
  assert.equal(out.slips, "4");
  assert.equal(out.declaration, "SUMIDENSO");
  const draft = result.rows.find((r) => r.customsStage === "Khai nháp"),
    transmit = result.rows.find((r) => r.customsStage === "Truyền");
  assert.equal(draft.customer, "KH NHÁP KHÁC");
  assert.equal(draft.receivedTime, "08:33");
  assert.equal(draft.transmittedBill, "");
  assert.equal(transmit.customer, "KH TRUYỀN KHÁC");
  assert.equal(transmit.confirmTime, "14:24");
  assert.equal(transmit.clearance, "00108742005960");
  assert.equal(transmit.customsBill, "");
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE shipments(id INTEGER PRIMARY KEY,data TEXT,updated TEXT); CREATE TABLE audit(id INTEGER PRIMARY KEY,at TEXT,user_id INTEGER,action TEXT,record_id INTEGER,detail TEXT);",
  );
  assert.deepEqual(importRows(db, result.rows, null), { count: 5, skipped: 0 });
  assert.deepEqual(importRows(db, result.rows, null), { count: 0, skipped: 5 });
  const roundtrip = await parseWorkbook(
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  assert.deepEqual(importRows(db, roundtrip.rows, null), {
    count: 0,
    skipped: 5,
  });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM shipments").get().n, 5);
  db.close();
});
test("T10: báo lỗi ngày thiếu và công thức, không âm thầm bỏ dữ liệu", async () => {
  const { wb, ws } = await original();
  ws.unMergeCells("A3:A5");
  ws.getCell("A3").value = null;
  ws.getCell("E4").value = { formula: "1+1", result: 2 };
  const result = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.ok(result.errors.some((e) => e.includes("Ngày XN")));
  assert.ok(result.errors.some((e) => e.includes("công thức")));
});
