// CLI dành cho người vận hành có quyền truy cập máy chủ, không cung cấp qua HTTP.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { parseWorkbook, importRows } = require("../excel-import");
(async () => {
  const filename = process.argv[2];
  if (!filename)
    throw new Error(
      "Dùng: node scripts/import-excel.js <file.xlsx> [--apply]. Mặc định chỉ kiểm tra.",
    );
  const buffer = fs.readFileSync(filename);
  const result = await parseWorkbook(buffer);
  console.log(
    JSON.stringify(
      {
        format: result.format,
        count: result.rows.length,
        summary: result.summary,
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
  if (result.errors.length)
    throw new Error("Cần sửa các lỗi trước khi nhập; chưa ghi dữ liệu.");
  if (!process.argv.includes("--apply")) return;
  const dir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  const dbPath = path.join(dir, "warehouse.sqlite");
  if (!fs.existsSync(dbPath))
    throw new Error("Khởi động ứng dụng lần đầu để tạo cơ sở dữ liệu trước.");
  const backupDir = path.join(dir, "imports");
  fs.mkdirSync(backupDir, { recursive: true });
  const archive = path.join(
    backupDir,
    crypto.createHash("sha256").update(buffer).digest("hex") + ".xlsx",
  );
  if (!fs.existsSync(archive))
    fs.writeFileSync(archive, buffer, { flag: "wx", mode: 0o600 });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  try {
    console.log(JSON.stringify(importRows(db, result.rows, null)));
  } finally {
    db.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
