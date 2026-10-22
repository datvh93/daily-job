"use strict";
const crypto = require("node:crypto");
const { monthlyWorkbook } = require("./reports");
const { fail } = require("./model");
function createDriveSync(db, readRows, env = process.env, fetcher = fetch) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS drive_connection(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL,folder TEXT NOT NULL DEFAULT '');CREATE TABLE IF NOT EXISTS drive_states(state TEXT PRIMARY KEY,user_id INTEGER NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS drive_jobs(month TEXT PRIMARY KEY,requested INTEGER NOT NULL,completed INTEGER NOT NULL DEFAULT 0,file_id TEXT, synced_at TEXT,error TEXT,next_try INTEGER NOT NULL DEFAULT 0);`,
  );
  const configReady = () =>
    Boolean(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.APP_URL &&
      env.DRIVE_ENCRYPTION_KEY?.length >= 32,
    );
  const key = () =>
    crypto
      .createHash("sha256")
      .update(env.DRIVE_ENCRYPTION_KEY || "")
      .digest();
  function seal(value) {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key(), iv);
    const buf = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
    return [iv, c.getAuthTag(), buf].map((b) => b.toString("base64")).join(".");
  }
  function open(value) {
    try {
      const [iv, tag, buf] = value
        .split(".")
        .map((s) => Buffer.from(s, "base64"));
      const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(buf), d.final()]).toString());
    } catch {
      throw new Error(
        "Không đọc được kết nối Drive. Kiểm tra khóa mã hóa hoặc kết nối lại.",
      );
    }
  }
  function status() {
    const c = db.prepare("SELECT id FROM drive_connection WHERE id=1").get();
    return {
      configured: configReady(),
      connected: Boolean(c),
      jobs: db
        .prepare(
          "SELECT month,requested,completed,file_id,synced_at,error FROM drive_jobs ORDER BY month DESC",
        )
        .all()
        .map((j) => ({
          ...j,
          pending: j.requested > j.completed,
          url: j.file_id
            ? "https://drive.google.com/file/d/" +
              encodeURIComponent(j.file_id) +
              "/view"
            : null,
        })),
    };
  }
  function enqueue(records) {
    const months = new Set(
      records
        .map((r) => r.date?.slice(0, 7))
        .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)),
    );
    for (const m of months)
      db.prepare(
        "INSERT INTO drive_jobs(month,requested) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET requested=requested+1,next_try=0",
      ).run(m);
  }
  function redirectUri() {
    let u;
    try {
      u = new URL(env.APP_URL);
    } catch {
      fail("APP_URL chưa hợp lệ", 503);
    }
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      fail("APP_URL phải dùng HTTPS", 503);
    return u.origin + "/api/drive/callback";
  }
  function connect(user) {
    if (!configReady())
      fail(
        "Cần cấu hình Google OAuth và khóa mã hóa trên máy chủ trước khi kết nối Drive.",
        503,
      );
    db.prepare("DELETE FROM drive_states WHERE expires<?").run(Date.now());
    const state = crypto.randomBytes(32).toString("hex"),
      verifier = crypto.randomBytes(48).toString("base64url");
    db.prepare("INSERT INTO drive_states VALUES(?,?,?,?)").run(
      state,
      user.id,
      verifier,
      Date.now() + 10 * 60000,
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }
  async function requestToken(values) {
    let res;
    try {
      res = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...values,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("Không kết nối được dịch vụ xác thực Google.");
    }
    const b = await res.json();
    if (!res.ok)
      throw new Error(
        "Google từ chối xác thực. Kiểm tra OAuth hoặc kết nối lại Drive.",
      );
    return b;
  }
  async function callback(user, state, code) {
    if (running) fail("Đang đồng bộ, vui lòng kết nối lại sau ít phút", 409);
    running = true;
    try {
      if (!configReady()) fail("Thiếu cấu hình Google Drive", 503);
      const saved = db
        .prepare(
          "SELECT * FROM drive_states WHERE state=? AND expires>? AND user_id=?",
        )
        .get(state, Date.now(), user.id);
      if (!saved) fail("Phiên kết nối Google hết hạn hoặc không hợp lệ", 400);
      db.prepare("DELETE FROM drive_states WHERE state=?").run(state);
      if (!code) fail("Google chưa cấp quyền kết nối");
      const t = await requestToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: saved.verifier,
      });
      if (!t.refresh_token)
        fail(
          "Google chưa cấp quyền truy cập dài hạn. Kết nối lại và chấp nhận quyền.",
          400,
        );
      const old = db.prepare("SELECT * FROM drive_connection WHERE id=1").get();
      if (old) {
        const previous = open(old.encrypted);
        if (previous.refreshToken !== t.refresh_token) {
          db.prepare(
            "UPDATE drive_jobs SET file_id=NULL,completed=0,synced_at=NULL,error=NULL,next_try=0",
          ).run();
        }
      }
      db.prepare(
        "INSERT INTO drive_connection(id,encrypted,folder) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted,folder=excluded.folder",
      ).run(seal({ refreshToken: t.refresh_token }), "");
      enqueue(readRows());
    } finally {
      running = false;
    }
  }
  async function google(url, access, options = {}) {
    let r;
    try {
      r = await fetcher(url, {
        ...options,
        headers: { ...options.headers, Authorization: "Bearer " + access },
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error(
        "Không kết nối được Google Drive; dữ liệu trong ứng dụng đã được giữ lại.",
      );
    }
    if (!r.ok) {
      if (r.status === 401)
        throw new Error("Quyền Google Drive hết hiệu lực. Hãy kết nối lại.");
      if (r.status === 403)
        throw new Error(
          "Google Drive từ chối truy cập. Kiểm tra quyền hoặc hạn mức tài khoản.",
        );
      throw new Error(
        "Google Drive trả lỗi " + r.status + ". Sẽ thử đồng bộ lại.",
      );
    }
    return r;
  }
  async function locate(access, query) {
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.search = new URLSearchParams({
      q: query,
      spaces: "drive",
      fields: "files(id,name)",
      pageSize: "100",
    });
    return (await (await google(u, access)).json()).files || [];
  }
  async function folderId(access) {
    let c = db.prepare("SELECT * FROM drive_connection WHERE id=1").get();
    if (c.folder) return c.folder;
    let folders = await locate(
      access,
      "trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='dailyKhoFolder' and value='1' }",
    );
    let id = folders[0]?.id;
    if (!id) {
      id = (
        await (
          await google(
            "https://www.googleapis.com/drive/v3/files?fields=id",
            access,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: "Daily Kho",
                mimeType: "application/vnd.google-apps.folder",
                appProperties: { dailyKhoFolder: "1" },
              }),
            },
          )
        ).json()
      ).id;
    }
    if (!id) throw new Error("Không tạo được thư mục Daily Kho.");
    db.prepare("UPDATE drive_connection SET folder=? WHERE id=1").run(id);
    return id;
  }
  let running = false;
  async function run() {
    if (
      running ||
      !configReady() ||
      !db.prepare("SELECT id FROM drive_connection WHERE id=1").get()
    )
      return;
    running = true;
    try {
      const jobs = db
        .prepare(
          "SELECT * FROM drive_jobs WHERE requested>completed AND next_try<=? ORDER BY month",
        )
        .all(Date.now());
      for (const j of jobs) {
        try {
          const conn = db
            .prepare("SELECT * FROM drive_connection WHERE id=1")
            .get();
          const token = await requestToken({
            grant_type: "refresh_token",
            refresh_token: open(conn.encrypted).refreshToken,
          });
          if (!token.access_token)
            throw new Error("Không nhận được quyền truy cập Google.");
          const access = token.access_token,
            folder = await folderId(access);
          let fileId = j.file_id;
          if (!fileId) {
            const files = await locate(
              access,
              `trashed=false and '${folder}' in parents and appProperties has { key='dailyKhoMonth' and value='${j.month}' }`,
            );
            fileId = files[0]?.id;
            if (!fileId) {
              fileId = (
                await (
                  await google(
                    "https://www.googleapis.com/drive/v3/files?fields=id",
                    access,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: `Daily-Kho-${j.month}.xlsx`,
                        mimeType:
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        parents: [folder],
                        appProperties: { dailyKhoMonth: j.month },
                      }),
                    },
                  )
                ).json()
              ).id;
            }
            if (!fileId) throw new Error("Không tạo được file Excel.");
            db.prepare("UPDATE drive_jobs SET file_id=? WHERE month=?").run(
              fileId,
              j.month,
            );
          }
          const buffer = await monthlyWorkbook(readRows(), j.month);
          await google(
            "https://www.googleapis.com/upload/drive/v3/files/" +
              encodeURIComponent(fileId) +
              "?uploadType=media",
            access,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              },
              body: buffer,
            },
          );
          db.prepare(
            "UPDATE drive_jobs SET completed=?,synced_at=?,error=NULL,next_try=0 WHERE month=?",
          ).run(j.requested, new Date().toISOString(), j.month);
        } catch (e) {
          db.prepare(
            "UPDATE drive_jobs SET error=?,next_try=? WHERE month=?",
          ).run(e.message, Date.now() + 60000, j.month);
        }
      }
    } finally {
      running = false;
    }
  }
  function retry() {
    db.prepare(
      "UPDATE drive_jobs SET next_try=0 WHERE requested>completed",
    ).run();
    void run();
  }
  function disconnect() {
    if (running) fail("Đang đồng bộ. Chờ hoàn tất rồi ngắt kết nối.", 409);
    db.prepare("DELETE FROM drive_connection").run();
    db.prepare("DELETE FROM drive_states").run();
    db.prepare(
      "UPDATE drive_jobs SET file_id=NULL,completed=0,synced_at=NULL,error=NULL,next_try=0",
    ).run();
  }
  const timer = setInterval(() => {
    void run().catch(() => {});
  }, 10000);
  timer.unref();
  return {
    status,
    enqueue,
    connect,
    callback,
    retry,
    disconnect,
    run,
    close: () => clearInterval(timer),
  };
}
module.exports = { createDriveSync };
