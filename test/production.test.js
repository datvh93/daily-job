const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
test("Production: khóa khởi tạo, từ chối thiếu khóa và cookie HTTPS", async (t) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "daily-kho-prod-"));
  let child;
  async function stop() {
    if (child && !child.killed) {
      const done = new Promise((r) => child.once("exit", r));
      child.kill();
      await done;
    }
  }
  t.after(async () => {
    await stop();
    fs.rmSync(data, { recursive: true, force: true });
  });
  async function start(token) {
    child = spawn(process.execPath, ["server.js"], {
      env: {
        ...process.env,
        DATA_DIR: data,
        PORT: "3202",
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        SETUP_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((r, j) => {
      child.stdout.once("data", r);
      child.once("error", j);
      child.once("exit", (c) => j(new Error("Server stopped " + c)));
    });
  }
  const base = "http://127.0.0.1:3202";
  const account = {
    name: "Kiểm thử",
    username: "production",
    password: "Production-Test-Password!",
  };
  async function request(p, b) {
    return fetch(base + p, {
      method: b ? "POST" : "GET",
      headers: b ? { "Content-Type": "application/json" } : {},
      body: b ? JSON.stringify(b) : undefined,
    });
  }
  await start("");
  assert.equal((await request("/healthz")).status, 200);
  assert.equal(
    (await (await request("/api/auth")).json()).setupTokenRequired,
    true,
  );
  assert.equal((await request("/api/setup", account)).status, 503);
  await stop();
  const token = crypto.randomBytes(32).toString("hex");
  await start(token);
  assert.equal((await request("/api/setup", account)).status, 403);
  assert.equal(
    (await request("/api/setup", { ...account, setupToken: "incorrect" }))
      .status,
    403,
  );
  assert.equal(
    (await request("/api/setup", { ...account, setupToken: token })).status,
    201,
  );
  const login = await request("/api/login", account);
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /; Secure/);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(
    (await request("/api/setup", { ...account, setupToken: token })).status,
    409,
  );
});
