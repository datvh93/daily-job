"use strict";
const ExcelJS = require("exceljs");
const { fields, classify, fail } = require("./model");
function periodRows(rows, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    fail("Tháng phải có dạng YYYY-MM");
  return rows
    .filter((r) => r.date.startsWith(month + "-"))
    .map((r) => ({ ...r, ...classify(r) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
function sheet(wb, name, columns, rows) {
  const s = wb.addWorksheet(name);
  s.columns = columns.map(([key, header]) => ({
    key,
    header,
    width: key === "note" || key === "sharedCells" ? 45 : 22,
  }));
  for (const r of rows) s.addRow(r);
  s.views = [{ state: "frozen", ySplit: 1 }];
  s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  s.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF087E78" },
  };
  s.autoFilter = {
    from: "A1",
    to: s.getRow(1).getCell(columns.length).address,
  };
  return s;
}
function summary(rows, key) {
  const result = new Map();
  for (const r of rows.filter((r) => r.direction !== "C11")) {
    const k = JSON.stringify([
      r[key] || "Chưa ghi",
      r.direction,
      r.unit || "Chưa ghi",
    ]);
    if (!result.has(k))
      result.set(k, {
        group: r[key] || "Chưa ghi",
        direction: r.direction,
        unit: r.unit || "Chưa ghi",
        count: 0,
        done: 0,
        packages: 0,
        weight: 0,
        missing: 0,
      });
    const a = result.get(k);
    a.count++;
    if (r.status === "Hoàn tất") a.done++;
    a.packages += Number(r.packages) || 0;
    a.weight += Number(r.weight) || 0;
    if (r.packages === "" || r.weight === "") a.missing++;
  }
  return [...result.values()];
}
async function monthlyWorkbook(allRows, month) {
  const rows = periodRows(allRows, month);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Kho";
  const counts = [
    ["Tháng", month],
    ["Hàng nhập", rows.filter((r) => r.direction === "Nhập").length],
    ["Hàng xuất", rows.filter((r) => r.direction === "Xuất").length],
    ["Khai nháp", rows.filter((r) => r.customsStage === "Khai nháp").length],
    ["Confirm truyền", rows.filter((r) => r.customsStage === "Truyền").length],
    [
      "Ghi chú",
      "SL kiện/GW ô gộp chỉ tính tại dòng đầu, không phân bổ; không cộng chung số kiện khác đơn vị. Ô trống/luồng chưa có được giữ nguyên.",
    ],
  ];
  sheet(
    wb,
    "Tổng hợp",
    [
      ["label", "Chỉ tiêu"],
      ["value", "Giá trị"],
    ],
    counts.map(([label, value]) => ({ label, value })),
  );
  const cargo = [
    "date",
    "customer",
    "declaration",
    "type",
    "invoice",
    "bill",
    "plannedDate",
    "movement",
    "declarant",
    "status",
    "pic",
    "slips",
    "packages",
    "unit",
    "weight",
    "note",
    "port",
    "cfs",
    "excelSource",
    "sharedCells",
  ];
  for (const direction of ["Nhập", "Xuất"])
    sheet(
      wb,
      "Hàng " + direction.toLowerCase(),
      cargo.map((k) => [k, fields[k]]),
      rows.filter((r) => r.direction === direction),
    );
  const drafts = [
    "date",
    "customer",
    "customsBill",
    "receivedTime",
    "customsStatus",
    "status",
    "customsPic",
    "draftTime",
    "excelSource",
  ];
  sheet(
    wb,
    "Khai nháp",
    drafts.map((k) => [k, fields[k]]),
    rows.filter((r) => r.customsStage === "Khai nháp"),
  );
  const trans = [
    "date",
    "customer",
    "transmittedBill",
    "confirmTime",
    "clearance",
    "transmitTime",
    "channel",
    "transmitStatus",
    "status",
    "draftId",
    "excelSource",
  ];
  sheet(
    wb,
    "Confirm truyền",
    trans.map((k) => [k, fields[k]]),
    rows.filter((r) => r.customsStage === "Truyền"),
  );
  const cols = [
    ["group", "Nhóm"],
    ["direction", "Nhập/Xuất"],
    ["unit", "Đơn vị"],
    ["count", "Số lô"],
    ["done", "Đã hoàn tất"],
    ["packages", "SL kiện có ghi"],
    ["weight", "GW có ghi (kg)"],
    ["missing", "Số lô có SL/GW trống hoặc gộp"],
  ];
  for (const [name, key] of [
    ["Theo ngày", "date"],
    ["Theo khách", "customer"],
    ["Theo PIC", "pic"],
  ])
    sheet(wb, name, cols, summary(rows, key));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { monthlyWorkbook, periodRows };
