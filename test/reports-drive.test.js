const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { DatabaseSync } = require("node:sqlite");
const { validate, classify } = require("../model");
const { monthlyWorkbook } = require("../reports");
const { createDriveSync } = require("../drive-sync");
const base = {
  date: "2026-10-21",
  direction: "Nhập",
  customer: "KH",
  status: "Chờ xử lý",
  packages: "10",
  weight: "100",
  unit: "PP",
};
test("Phân loại kho ngoại quan theo đầu số, bên mở tờ khai, CFS và luồng xanh/vàng/đỏ", () => {
  for (const [direction, declaration, movement, declarant] of [
    ["Nhập", "309012079630", "Nội địa → Kho", "Khách hàng"],
    ["Nhập", "108731904740", "Nước ngoài → Kho", "Kho"],
    ["Xuất", "108725034720", "Kho → Nội địa", "Khách hàng"],
    ["Xuất", "500668502430", "Kho → Nước ngoài / CFS", "Kho"],
  ]) {
    const d = validate({ ...base, direction, declaration });
    assert.equal(d.movement, movement);
    assert.equal(d.declarant, declarant);
  }
  assert.equal(
    validate({
      ...base,
      direction: "Xuất",
      declaration: "500668502430",
      movement: "Kho → CFS",
    }).movement,
    "Kho → CFS",
  );
  assert.equal(classify({ ...base, declaration: "SUMIDENSO" }).declarant, "");
  assert.throws(() => validate({ ...base, channel: "OK" }), /Luồng tờ khai/);
  for (const channel of ["Xanh", "Vàng", "Đỏ"])
    assert.equal(validate({ ...base, channel }).channel, channel);
});
test("Báo cáo tháng: tách sheet, giữ ô trống/nhóm gộp, không cộng kiện khác đơn vị", async () => {
  const rows = [
    validate({ ...base, declaration: "309012079630", pic: "A" }),
    validate({
      ...base,
      packages: "",
      weight: "",
      sharedCells: "SL kiện: J3:J4",
      pic: "B",
    }),
    validate({ ...base, packages: "2", weight: "40", unit: "CT", pic: "A" }),
    validate({ ...base, date: "2026-11-01" }),
    validate({
      ...base,
      direction: "C11",
      customsStage: "Khai nháp",
      customsBill: "BILL-D",
      packages: "",
      weight: "",
    }),
    validate({
      ...base,
      direction: "C11",
      customsStage: "Truyền",
      clearance: "00108742005960",
      channel: "Vàng",
      draftId: "5",
    }),
  ];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await monthlyWorkbook(rows, "2026-10"));
  assert.equal(wb.worksheets.length, 8);
  assert.equal(wb.getWorksheet("Hàng nhập").rowCount, 4);
  assert.equal(wb.getWorksheet("Khai nháp").rowCount, 2);
  const tr = wb.getWorksheet("Confirm truyền");
  assert.ok(tr.getRow(2).values.includes("00108742005960"));
  assert.ok(tr.getRow(2).values.includes("Vàng"));
  const daily = wb.getWorksheet("Theo ngày");
  assert.equal(daily.rowCount, 3);
  assert.equal(daily.getCell("F2").value, 10);
  assert.equal(daily.getCell("F3").value, 2);
  assert.equal(daily.getCell("H2").value, 1);
  assert.ok(
    wb.getWorksheet("Hàng nhập").getRow(2).values.includes("Khách hàng"),
  );
  await assert.rejects(() => monthlyWorkbook(rows, "2026-13"), /Tháng/);
});
function database() {
  const db = new DatabaseSync(":memory:");
  return db;
}
const env = {
  APP_URL: "https://example.test",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "fake-test-client-secret",
  DRIVE_ENCRYPTION_KEY: "test-encryption-key-only-not-production-12345",
};
test("Google OAuth có state/PKCE, token được mã hóa; tạo file một lần, cập nhật, thử lại khi lỗi", async (t) => {
  const db = database();
  let records = [validate(base)],
    uploads = 0,
    createFiles = 0,
    failUpload = false,
    refreshTokens = 0,
    mutateOnUpload = false;
  const calls = [];
  let sync;
  async function fakeFetch(url, options) {
    url = String(url);
    calls.push(url);
    if (url.includes("oauth2.googleapis.com")) {
      const form = options.body;
      if (form.get("grant_type") === "authorization_code")
        return Response.json({
          refresh_token: "test-refresh-token-private",
          access_token: "access",
        });
      refreshTokens++;
      return Response.json({ access_token: "access" });
    }
    assert.equal(options.headers.Authorization, "Bearer access");
    if (url.includes("/upload/")) {
      if (failUpload) return new Response("", { status: 403 });
      uploads++;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(options.body);
      assert.equal(wb.getWorksheet("Hàng nhập").rowCount, records.length + 1);
      if (mutateOnUpload) {
        mutateOnUpload = false;
        sync.enqueue(records);
      }
      return Response.json({ id: "file1" });
    }
    if (options.method === "POST") {
      const data = JSON.parse(options.body);
      if (data.mimeType === "application/vnd.google-apps.folder")
        return Response.json({ id: "folder1" });
      createFiles++;
      assert.equal(data.name, "Daily-Kho-2026-10.xlsx");
      return Response.json({ id: "file1" });
    }
    if (url.includes("/files?")) return Response.json({ files: [] });
    throw new Error("Unexpected mocked endpoint");
  }
  sync = createDriveSync(db, () => records, env, fakeFetch);
  t.after(() => {
    sync.close();
    db.close();
  });
  sync.enqueue(records);
  assert.equal(sync.status().connected, false);
  const link = new URL(sync.connect({ id: 1 }));
  assert.equal(
    link.searchParams.get("scope"),
    "https://www.googleapis.com/auth/drive.file",
  );
  assert.ok(link.searchParams.get("code_challenge"));
  const state = link.searchParams.get("state");
  await assert.rejects(
    () => sync.callback({ id: 2 }, state, "code"),
    /không hợp lệ/,
  );
  await sync.callback({ id: 1 }, state, "code");
  const encrypted = db
    .prepare("SELECT encrypted FROM drive_connection")
    .get().encrypted;
  assert.ok(!encrypted.includes("test-refresh-token-private"));
  assert.equal(sync.status().connected, true);
  await sync.run();
  assert.equal(createFiles, 1);
  assert.equal(uploads, 1);
  let job = sync.status().jobs[0];
  assert.equal(job.pending, false);
  assert.equal(job.file_id, "file1");
  assert.ok(job.synced_at);
  records.push(validate({ ...base, customer: "B" }));
  sync.enqueue(records);
  failUpload = true;
  await sync.run();
  job = sync.status().jobs[0];
  assert.equal(job.pending, true);
  assert.match(job.error, /từ chối/);
  assert.equal(records.length, 2);
  failUpload = false;
  db.prepare("UPDATE drive_jobs SET next_try=0").run();
  mutateOnUpload = true;
  await sync.run();
  assert.equal(sync.status().jobs[0].pending, true);
  await sync.run();
  assert.equal(sync.status().jobs[0].pending, false);
  assert.equal(createFiles, 1);
  assert.equal(uploads, 3);
  assert.ok(refreshTokens >= 4);
  records = [];
  sync.enqueue([{ date: "2026-10-21" }]);
  await sync.run();
  assert.equal(sync.status().jobs[0].pending, false);
  assert.equal(createFiles, 1);
  sync.disconnect();
  assert.equal(sync.status().connected, false);
  assert.equal(sync.status().jobs[0].pending, true);
});
test("Thiếu cấu hình không báo đã kết nối/đã đồng bộ", () => {
  const db = database();
  const sync = createDriveSync(db, () => [], {});
  sync.enqueue([base]);
  assert.equal(sync.status().configured, false);
  assert.equal(sync.status().connected, false);
  assert.equal(sync.status().jobs[0].pending, true);
  assert.throws(() => sync.connect({ id: 1 }), /cấu hình/);
  sync.close();
  db.close();
});
