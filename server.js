"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const ExcelJS = require("exceljs");
const dir = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "warehouse.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(id INTEGER PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,user_id INTEGER,action TEXT NOT NULL,record_id INTEGER,detail TEXT);
`);
const { fields, fail, validate } = require("./model");
const { parseWorkbook, importRows } = require("./excel-import");
function password(p) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(p, salt, 64).toString("hex");
}
function verify(p, hash) {
  const [salt, h] = hash.split(":");
  return crypto.timingSafeEqual(
    crypto.scryptSync(p, salt, 64),
    Buffer.from(h, "hex"),
  );
}
function audit(user, action, id, detail = "") {
  db.prepare(
    "INSERT INTO audit(at,user_id,action,record_id,detail) VALUES(?,?,?,?,?)",
  ).run(new Date().toISOString(), user?.id ?? null, action, id ?? null, detail);
}
function rows() {
  return db
    .prepare("SELECT * FROM shipments ORDER BY id DESC")
    .all()
    .map((r) => ({
      ...JSON.parse(r.data),
      id: r.id,
      version: r.version,
      updated: r.updated,
    }));
}
function insert(d, user) {
  const r = db
    .prepare("INSERT INTO shipments(data,updated) VALUES(?,?)")
    .run(JSON.stringify(d), new Date().toISOString());
  audit(user, "Tạo lô hàng", Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}
function userFrom(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("session="))
    ?.slice(8);
  if (!token) return null;
  return (
    db
      .prepare(
        "SELECT u.id,u.name,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?",
      )
      .get(
        crypto.createHash("sha256").update(token).digest("hex"),
        Date.now(),
      ) || null
  );
}
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 8 * 1024 * 1024) fail("Tệp quá lớn. Tối đa 5 MB Excel.", 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    fail("Nội dung yêu cầu không hợp lệ");
  }
}
function send(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
const attempts = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost"),
      p = url.pathname;
    const user = userFrom(req);
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !==
        `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${req.headers.host}`
    )
      fail("Nguồn yêu cầu không hợp lệ", 403);
    if (p === "/healthz" && req.method === "GET") {
      db.prepare("SELECT 1").get();
      return send(res, 200, { ok: true });
    }
    if (p === "/api/auth" && req.method === "GET")
      return send(res, 200, {
        user,
        setupTokenRequired:
          process.env.NODE_ENV === "production" ||
          Boolean(process.env.SETUP_TOKEN),
        needsSetup: !db.prepare("SELECT id FROM users LIMIT 1").get(),
      });
    if (p === "/api/setup" && req.method === "POST") {
      if (db.prepare("SELECT id FROM users LIMIT 1").get())
        fail("Ứng dụng đã có quản trị viên", 409);
      const b = await body(req);
      if (process.env.NODE_ENV === "production" || process.env.SETUP_TOKEN) {
        if (!process.env.SETUP_TOKEN || process.env.SETUP_TOKEN.length < 32)
          fail(
            "Máy chủ chưa có khóa khởi tạo hợp lệ. Người vận hành cần cấu hình SETUP_TOKEN ít nhất 32 ký tự.",
            503,
          );
        const supplied = typeof b.setupToken === "string" ? b.setupToken : "";
        const digest = (value) =>
          crypto.createHash("sha256").update(value).digest();
        if (
          !crypto.timingSafeEqual(
            digest(supplied),
            digest(process.env.SETUP_TOKEN),
          )
        )
          fail("Khóa khởi tạo không đúng", 403);
      }
      checkUser(b);
      if (db.prepare("SELECT id FROM users LIMIT 1").get())
        fail("Ứng dụng đã có quản trị viên", 409);
      db.prepare(
        "INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)",
      ).run(
        b.name.trim(),
        b.username.trim().toLowerCase(),
        password(b.password),
        "admin",
      );
      audit(null, "Khởi tạo quản trị viên");
      return send(res, 201, { ok: true });
    }
    if (p === "/api/login" && req.method === "POST") {
      const key = req.socket.remoteAddress;
      let a = attempts.get(key);
      if (a && a.until < Date.now()) {
        attempts.delete(key);
        a = null;
      }
      if (a?.count >= 10)
        fail("Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.", 429);
      const b = await body(req);
      if (
        typeof b.username !== "string" ||
        typeof b.password !== "string" ||
        b.password.length > 200
      )
        fail("Thông tin đăng nhập không hợp lệ");
      const u = db
        .prepare("SELECT * FROM users WHERE username=?")
        .get(b.username.trim().toLowerCase());
      if (!u || u.role === "disabled" || !verify(b.password, u.password)) {
        attempts.set(key, {
          count: (a?.count || 0) + 1,
          until: Date.now() + 15 * 60 * 1000,
        });
        fail("Sai tên đăng nhập hoặc mật khẩu", 401);
      }
      attempts.delete(key);
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      const t = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        crypto.createHash("sha256").update(t).digest("hex"),
        u.id,
        Date.now() + 12 * 3600000,
      );
      res.setHeader(
        "Set-Cookie",
        `session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
      );
      return send(res, 200, { ok: true });
    }
    if (p.startsWith("/api/")) {
      if (!user) fail("Vui lòng đăng nhập", 401);
      if (p === "/api/logout" && req.method === "POST") {
        const t = (req.headers.cookie || "").match(
          /(?:^|;\s*)session=([^;]+)/,
        )?.[1];
        if (t)
          db.prepare("DELETE FROM sessions WHERE token=?").run(
            crypto.createHash("sha256").update(t).digest("hex"),
          );
        res.setHeader(
          "Set-Cookie",
          "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
        return send(res, 200, { ok: true });
      }
      if (p === "/api/users") {
        if (user.role !== "admin")
          fail("Chỉ quản trị viên được quản lý tài khoản", 403);
        if (req.method === "GET")
          return send(
            res,
            200,
            db
              .prepare("SELECT id,name,username,role FROM users ORDER BY id")
              .all(),
          );
        if (req.method === "POST") {
          const b = await body(req);
          checkUser(b);
          if (!["admin", "staff", "viewer"].includes(b.role))
            fail("Vai trò không hợp lệ");
          if (
            db
              .prepare("SELECT id FROM users WHERE username=?")
              .get(b.username.trim().toLowerCase())
          )
            fail("Tên đăng nhập đã tồn tại", 409);
          db.prepare(
            "INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)",
          ).run(
            b.name.trim(),
            b.username.trim().toLowerCase(),
            password(b.password),
            b.role,
          );
          audit(user, "Tạo tài khoản", null, b.username);
          return send(res, 201, { ok: true });
        }
      }
      const um = p.match(/^\/api\/users\/(\d+)$/);
      if (um && req.method === "PATCH") {
        if (user.role !== "admin") fail("Không có quyền", 403);
        const id = Number(um[1]),
          b = await body(req);
        const target = db.prepare("SELECT * FROM users WHERE id=?").get(id);
        if (!target) fail("Không tìm thấy tài khoản", 404);
        if (!["admin", "staff", "viewer", "disabled"].includes(b.role))
          fail("Vai trò không hợp lệ");
        if (
          target.role === "admin" &&
          b.role !== "admin" &&
          db.prepare("SELECT count(*) n FROM users WHERE role='admin'").get()
            .n <= 1
        )
          fail("Phải giữ ít nhất một quản trị viên");
        if (
          b.password &&
          (typeof b.password !== "string" ||
            b.password.length < 10 ||
            b.password.length > 200)
        )
          fail("Mật khẩu cần 10–200 ký tự");
        db.prepare("UPDATE users SET role=?,password=? WHERE id=?").run(
          b.role,
          b.password ? password(b.password) : target.password,
          id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        audit(user, "Cập nhật tài khoản", null, target.username);
        return send(res, 200, { ok: true });
      }
      if (user.role === "disabled") fail("Tài khoản đã bị khóa", 403);
      if (p === "/api/audit" && req.method === "GET") {
        if (user.role !== "admin") fail("Không có quyền", 403);
        return send(
          res,
          200,
          db
            .prepare(
              "SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200",
            )
            .all(),
        );
      }
      if (p === "/api/shipments" && req.method === "GET")
        return send(res, 200, rows());
      if (
        (p === "/api/template" || p === "/api/export") &&
        req.method === "GET"
      ) {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Ke hoach");
        ws.columns = Object.entries(fields).map(([key, header]) => ({
          key,
          header,
          width: 22,
        }));
        ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
        ws.views = [{ state: "frozen", ySplit: 1 }];
        ws.autoFilter = {
          from: "A1",
          to: ws.getRow(1).getCell(Object.keys(fields).length).address,
        };
        if (p === "/api/export")
          for (const r of rows().filter(
            (r) =>
              !url.searchParams.get("date") ||
              r.date === url.searchParams.get("date"),
          ))
            ws.addRow(r);
        else
          ws.addRow({
            date: new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Ho_Chi_Minh",
            }),
            direction: "Nhập",
            customer: "KHÁCH MẪU — xóa dòng này trước khi nhập",
            status: "Chờ xử lý",
            packages: 0,
            weight: 0,
            unit: "CT",
          });
        res.writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="ke-hoach-kho.xlsx"',
        });
        return res.end(Buffer.from(await wb.xlsx.writeBuffer()));
      }
      if (
        ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
        user.role === "viewer"
      )
        fail("Tài khoản chỉ có quyền xem", 403);
      if (p === "/api/import/preview" && req.method === "POST") {
        const b = await body(req);
        if (typeof b.file !== "string") fail("Thiếu tệp Excel");
        const buf = Buffer.from(b.file, "base64");
        if (buf.length > 5 * 1024 * 1024) fail("Tệp Excel tối đa 5 MB");
        const result = await parseWorkbook(buf);
        const existing = new Set(
          rows()
            .map((r) => r.importKey)
            .filter(Boolean),
        );
        result.duplicates = result.rows.filter(
          (r) => r.importKey && existing.has(r.importKey),
        ).length;
        return send(res, 200, result);
      }

      if (p === "/api/import" && req.method === "POST") {
        const b = await body(req);
        if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 1000)
          fail("Cần 1–1.000 dòng");
        const result = importRows(db, b.rows, user);
        return send(res, 201, result);
      }

      if (p === "/api/shipments" && req.method === "POST")
        return send(res, 201, { id: insert(validate(await body(req)), user) });
      const m = p.match(/^\/api\/shipments\/(\d+)$/);
      if (m && ["PUT", "DELETE"].includes(req.method)) {
        const id = Number(m[1]);
        const b = await body(req);
        const old = db.prepare("SELECT * FROM shipments WHERE id=?").get(id);
        if (!old) fail("Không tìm thấy lô hàng", 404);
        if (b.version !== old.version)
          fail(
            "Lô hàng vừa được người khác cập nhật. Hãy tải lại rồi thử lại.",
            409,
          );
        if (req.method === "DELETE") {
          if (user.role !== "admin") fail("Chỉ quản trị viên được xóa", 403);
          db.prepare("DELETE FROM shipments WHERE id=?").run(id);
          audit(user, "Xóa lô hàng", id, old.data);
        } else {
          const d = validate({
            ...b,
            excelSource: JSON.parse(old.data).excelSource,
            sharedCells: JSON.parse(old.data).sharedCells,
            importKey: JSON.parse(old.data).importKey,
          });
          const previous = JSON.parse(old.data);
          for (const key of ["packages", "weight"])
            if (
              previous[key] === "" &&
              (previous.sharedCells || "").includes(fields[key] + ":") &&
              d[key] !== ""
            )
              fail(
                "Giá trị dùng chung: hãy sửa tại ô đầu nhóm được ghi trong nguồn Excel.",
              );
          db.prepare(
            "UPDATE shipments SET data=?,version=version+1,updated=? WHERE id=?",
          ).run(JSON.stringify(d), new Date().toISOString(), id);
          audit(user, "Sửa lô hàng", id, old.data);
        }
        return send(res, 200, { ok: true });
      }
      fail("Không tìm thấy chức năng", 404);
    }
    if (req.method !== "GET") fail("Không hỗ trợ", 405);
    const files = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };
    if (!files[p]) fail("Không tìm thấy", 404);
    res.writeHead(200, {
      "Content-Type": p.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : p.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    });
    res.end(fs.readFileSync(path.join(__dirname, "public", files[p])));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, {
      error: e.status ? e.message : "Lỗi máy chủ. Vui lòng thử lại.",
    });
  }
});
function checkUser(b) {
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 100)
    fail("Nhập họ tên (tối đa 100 ký tự)");
  if (
    typeof b.username !== "string" ||
    !/^[a-zA-Z0-9._-]{3,40}$/.test(b.username)
  )
    fail("Tên đăng nhập: 3–40 chữ, số hoặc . _ -");
  if (
    typeof b.password !== "string" ||
    b.password.length < 10 ||
    b.password.length > 200
  )
    fail("Mật khẩu cần 10–200 ký tự");
}
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "Ứng dụng kho đã khởi động trên cổng " + (process.env.PORT || 3000),
    ),
);
