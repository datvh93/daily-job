const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ExcelJS = require("exceljs");
test("Tài khoản, phân quyền, lô hàng, Excel, xung đột và lưu bền", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-kho-test-"));
  let child;
  const base = "http://127.0.0.1:3198";
  async function start() {
    child = spawn(process.execPath, ["server.js"], {
      env: { ...process.env, PORT: "3198", DATA_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error("Server stopped " + code)));
    });
  }
  async function stop() {
    if (child && !child.killed) {
      const done = new Promise((r) => child.once("exit", r));
      child.kill();
      await done;
    }
  }
  t.after(async () => {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await start();
  async function req(p, method = "GET", data, cookie) {
    const r = await fetch(base + p, {
      method,
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const admin = {
    name: "Quản trị",
    username: "admin",
    password: "Test-Only-Long-Password!",
  };
  assert.equal((await req("/api/shipments")).status, 401);
  assert.equal((await req("/api/auth")).body.needsSetup, true);
  assert.equal((await req("/api/setup", "POST", admin)).status, 201);
  assert.equal((await req("/api/setup", "POST", admin)).status, 409);
  const ac = (await req("/api/login", "POST", admin)).cookie;
  assert.ok(ac);
  const staff = {
      name: "Nhân viên",
      username: "staff",
      password: "Staff-Password-123",
      role: "staff",
    },
    viewer = {
      name: "Người xem",
      username: "viewer",
      password: "Viewer-Password-123",
      role: "viewer",
    };
  for (const u of [staff, viewer])
    assert.equal((await req("/api/users", "POST", u, ac)).status, 201);
  const sc = (await req("/api/login", "POST", staff)).cookie,
    vc = (await req("/api/login", "POST", viewer)).cookie;
  assert.equal((await req("/api/users", "GET", null, sc)).status, 403);
  const shipment = {
    date: "2026-10-21",
    direction: "Nhập",
    customer: "SUNWA",
    declaration: "001234567890",
    invoice: "INV-001",
    bill: "BILL-123",
    status: "Chờ xử lý",
    packages: 11,
    weight: 279.28,
    unit: "PP",
    customsBill: "C11-001",
    receivedTime: "08:33",
  };
  assert.equal((await req("/api/shipments", "POST", shipment, vc)).status, 403);
  assert.equal(
    (await req("/api/shipments", "POST", { ...shipment, packages: -1 }, sc))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/shipments",
        "POST",
        { ...shipment, date: "2026-02-30" },
        sc,
      )
    ).status,
    400,
  );
  const created = await req("/api/shipments", "POST", shipment, sc);
  assert.equal(created.status, 201);
  const id = created.body.id;
  let row = (await req("/api/shipments", "GET", null, vc)).body[0];
  assert.equal(row.declaration, "001234567890");
  assert.equal(
    (
      await req(
        "/api/shipments/" + id,
        "PUT",
        { ...row, status: "Hoàn tất" },
        sc,
      )
    ).status,
    200,
  );
  assert.equal((await req("/api/shipments/" + id, "PUT", row, sc)).status, 409);
  const exportResponse = await fetch(base + "/api/export?date=2026-10-21", {
    headers: { cookie: vc },
  });
  assert.equal(exportResponse.status, 200);
  const buffer = Buffer.from(await exportResponse.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  assert.equal(wb.worksheets[0].rowCount, 2);
  assert.equal(wb.worksheets[0].getCell("D2").text, "001234567890");
  const preview = await req(
    "/api/import/preview",
    "POST",
    { file: buffer.toString("base64") },
    sc,
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.body.rows.length, 1);
  assert.deepEqual(preview.body.errors, []);
  assert.equal(
    (await req("/api/import", "POST", { rows: preview.body.rows }, sc)).body
      .count,
    1,
  );
  assert.equal(
    (
      await req(
        "/api/import",
        "POST",
        { rows: [shipment, { ...shipment, packages: -2 }] },
        sc,
      )
    ).status,
    400,
  );
  assert.equal((await req("/api/shipments", "GET", null, ac)).body.length, 2);
  row = (await req("/api/shipments", "GET", null, ac)).body.find(
    (r) => r.id === id,
  );
  assert.equal(
    (await req("/api/shipments/" + id, "DELETE", { version: row.version }, sc))
      .status,
    403,
  );
  assert.equal(
    (await req("/api/users/1", "PATCH", { role: "viewer" }, ac)).status,
    400,
  );
  await stop();
  await start();
  assert.equal((await req("/api/shipments", "GET", null, ac)).body.length, 2);
  assert.equal(
    (await req("/api/shipments/" + id, "DELETE", { version: row.version }, ac))
      .status,
    200,
  );
  assert.ok(
    (await req("/api/audit", "GET", null, ac)).body.some(
      (a) => a.action === "Xóa lô hàng",
    ),
  );
  assert.equal(
    (await req("/api/users/3", "PATCH", { role: "disabled" }, ac)).status,
    200,
  );
  assert.equal((await req("/api/shipments", "GET", null, vc)).status, 401);
  assert.equal((await req("/api/logout", "POST", {}, ac)).status, 200);
  assert.equal((await req("/api/shipments", "GET", null, ac)).status, 401);
});
