"use strict";
const ExcelJS = require("exceljs");
const crypto = require("node:crypto");
const { fields, validate, fail } = require("./model");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
function text(cell) {
  if (cell.type === ExcelJS.ValueType.Formula)
    fail(`${cell.address}: chuyển công thức thành giá trị trước khi nhập`);
  if (cell.value === null || cell.value === undefined) return "";
  if (cell.value instanceof Date) {
    if (/h|s/i.test(cell.numFmt) && !/[dy]/i.test(cell.numFmt))
      return cell.value.toISOString().slice(11, 16);
    return cell.value.toISOString().slice(0, 10);
  }
  if (typeof cell.value === "number") {
    if (!Number.isFinite(cell.value)) fail(`${cell.address}: số không hợp lệ`);
    if (/^0+$/.test(cell.numFmt))
      return String(cell.value).padStart(cell.numFmt.length, "0");
    return String(cell.value);
  }
  return cell.text.trim();
}
const mapIn = {
  2: "customer",
  3: "declaration",
  4: "type",
  5: "invoice",
  6: "bill",
  7: "plannedDate",
  9: "pic",
  10: "packages",
  11: "unit",
  12: "weight",
  13: "note",
};
const mapOut = {
  14: "customer",
  15: "declaration",
  16: "type",
  17: "invoice",
  18: "plannedDate",
  19: "slips",
  21: "pic",
  22: "packages",
  23: "unit",
  24: "weight",
  25: "note",
  26: "port",
  27: "cfs",
};
const mapDraft = {
  28: "warehouse",
  29: "customsBill",
  30: "receivedTime",
  31: "customsStatus",
  32: "customsPic",
  33: "draftTime",
};
const mapTransmit = {
  34: "transporter",
  35: "transmittedBill",
  36: "confirmTime",
  37: "clearance",
  38: "transmitTime",
  39: "transmitStatus",
};
function isOriginal(ws) {
  return (
    ws.getCell("B1").text.trim() === "Hàng Nhập" &&
    ws.getCell("N1").text.trim() === "Hàng Xuất" &&
    ws.getCell("AB1").text.trim() === "Tờ khai C11" &&
    ws.getCell("A2").text.trim() === "Ngày XN"
  );
}
function original(ws, result) {
  for (let i = 3; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    for (const [block, map, statusCol] of [
      ["Nhập", mapIn, 8],
      ["Xuất", mapOut, 20],
      ["Khai nháp", mapDraft, null],
      ["Truyền", mapTransmit, null],
    ]) {
      try {
        const cols = Object.keys(map).map(Number);
        if (
          !cols.some(
            (c) =>
              typeof row.getCell(c).value !== "boolean" && text(row.getCell(c)),
          )
        )
          continue;
        const d = {
          date: text(row.getCell(1)),
          direction: statusCol ? block : "C11",
          customsStage: statusCol ? "" : block,
        };
        const shared = [];
        for (const [col, k] of Object.entries(map)) {
          const cell = row.getCell(Number(col));
          d[k] = text(cell);
          if (
            cell.isMerged &&
            cell.master.address !== cell.address &&
            ["packages", "weight"].includes(k)
          )
            d[k] = "";
          if (cell.isMerged) {
            const range = ws.model.merges.find((m) => {
              const [a, b] = m.split(":").map((x) => ws.getCell(x));
              return (
                cell.row >= a.row &&
                cell.row <= b.row &&
                cell.col >= a.col &&
                cell.col <= b.col
              );
            });
            shared.push(
              `${fields[k]}: ${range} (giá trị tại ${cell.master.address})`,
            );
          }
        }
        if (!statusCol) {
          d.customer = d.warehouse || d.transporter;
          d.status =
            (block === "Khai nháp"
              ? d.customsStatus
              : d.transmitStatus
            ).toUpperCase() === "OK"
              ? "Hoàn tất"
              : "Chờ xử lý";
        } else {
          const v = row.getCell(statusCol).value;
          if (v !== true && v !== false && v !== null && v !== undefined)
            fail(
              `Trạng thái ${row.getCell(statusCol).address} phải là checkbox TRUE/FALSE`,
            );
          d.status = v === true ? "Hoàn tất" : "Chờ xử lý";
        }
        d.excelSource = `${ws.name}!${ws.getCell(i, cols[0]).address}:${ws.getCell(i, cols.at(-1)).address}`;
        d.sharedCells = [...new Set(shared)].join("; ");
        const normalized = validate(d);
        normalized.importKey = hash(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(normalized).filter(
                ([key]) =>
                  !["movement", "declarant", "channel", "draftId"].includes(
                    key,
                  ),
              ),
            ),
          ),
        );
        result.rows.push(normalized);
      } catch (e) {
        result.errors.push(`${ws.name}, dòng ${i}, ${block}: ${e.message}`);
      }
    }
  }
}
function flat(ws, result) {
  const columns = {};
  const aliases = {
    "Số tờ khai CFS": "cfs",
    "Khách nhập": "warehouse",
    "Giờ nhận": "receivedTime",
    "Số thông quan": "clearance",
    "Công đoạn C11": "customsStage",
  };
  ws.getRow(1).eachCell((c, i) => {
    const key =
      Object.keys(fields).find((k) => fields[k] === c.text.trim()) ||
      aliases[c.text.trim()];
    if (key) columns[i] = key;
  });
  for (const key of ["date", "direction", "customer", "status"])
    if (!Object.values(columns).includes(key))
      fail(
        `${ws.name}: thiếu cột ${fields[key]}. Dùng file T10 gốc hoặc mẫu của ứng dụng.`,
      );
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    if (!row.hasValues) continue;
    try {
      const d = {};
      for (const [col, key] of Object.entries(columns))
        d[key] = text(row.getCell(Number(col)));
      result.rows.push(validate(d));
    } catch (e) {
      result.errors.push(`${ws.name}, dòng ${i}: ${e.message}`);
    }
  }
}
async function parseWorkbook(buffer) {
  if (buffer.length > 5 * 1024 * 1024) fail("Tệp Excel tối đa 5 MB");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    fail("Không đọc được Excel. Hãy chọn tệp .xlsx hợp lệ.");
  }
  if (!wb.worksheets.length) fail("Tệp không có trang tính");
  const result = { rows: [], errors: [], warnings: [], format: "Mẫu ứng dụng" };
  let physicalRows = 0;
  const originalSheets = wb.worksheets.filter(isOriginal);
  if (originalSheets.length) {
    result.format = "Bố cục T10";
    for (const ws of originalSheets) {
      physicalRows += ws.rowCount;
      if (physicalRows > 10000) fail("Tệp có quá nhiều dòng");
      original(ws, result);
    }
    if (originalSheets.length !== wb.worksheets.length)
      result.warnings.push(
        "Chỉ đọc các sheet nhận diện được bố cục T10. Các sheet khác không được nhập.",
      );
    result.warnings.push(
      "Khai nháp và Truyền C11 được lưu riêng, không ghép theo vị trí dòng.",
      "SL kiện/GW ô gộp chỉ lưu tại dòng đầu của nhóm; dòng còn lại giữ tham chiếu ô gộp, không chia đều hoặc cộng trùng.",
      "Ô trống được giữ trống; TRUE → Hoàn tất, FALSE/ô trạng thái trống → Chờ xử lý.",
    );
  } else {
    if (wb.worksheets[0].rowCount > 1001)
      fail("Tối đa 1.000 dòng mỗi lần nhập");
    flat(wb.worksheets[0], result);
    if (wb.worksheets.length > 1)
      result.warnings.push("Mẫu phẳng: chỉ đọc sheet đầu tiên.");
  }
  if (result.rows.length > 1000) fail("Tối đa 1.000 bản ghi mỗi lần nhập");
  result.summary = {
    inbound: result.rows.filter((r) => r.direction === "Nhập").length,
    outbound: result.rows.filter((r) => r.direction === "Xuất").length,
    draft: result.rows.filter((r) => r.customsStage === "Khai nháp").length,
    transmit: result.rows.filter((r) => r.customsStage === "Truyền").length,
  };
  return result;
}
function importRows(db, input, user) {
  const data = input.map(validate);
  db.exec("BEGIN IMMEDIATE");
  let count = 0,
    skipped = 0;
  try {
    const seen = new Set(
      db
        .prepare("SELECT data FROM shipments")
        .all()
        .map((r) => JSON.parse(r.data).importKey)
        .filter(Boolean),
    );
    for (const d of data) {
      if (d.importKey && seen.has(d.importKey)) {
        skipped++;
        continue;
      }
      const at = new Date().toISOString();
      const id = Number(
        db
          .prepare("INSERT INTO shipments(data,updated) VALUES(?,?)")
          .run(JSON.stringify(d), at).lastInsertRowid,
      );
      db.prepare(
        "INSERT INTO audit(at,user_id,action,record_id,detail) VALUES(?,?,?,?,?)",
      ).run(
        at,
        user?.id ?? null,
        "Nhập Excel",
        id,
        d.excelSource || "Mẫu ứng dụng",
      );
      if (d.importKey) seen.add(d.importKey);
      count++;
    }
    db.exec("COMMIT");
    return { count, skipped };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
module.exports = { parseWorkbook, importRows };
