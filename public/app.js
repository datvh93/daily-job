"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  user: null,
  rows: [],
  view: "plan",
  direction: "",
  edit: null,
  importRows: [],
};
const labels = {
  date: "Ngày XN",
  direction: "Nhập/Xuất",
  customer: "Tên khách",
  declaration: "Số tờ khai",
  type: "Mã loại hình",
  invoice: "Số INV / Hóa đơn",
  bill: "Số BILL",
  plannedDate: "Ngày tờ khai",
  status: "Trạng thái",
  pic: "PIC",
  slips: "SL phiếu",
  packages: "SL kiện",
  unit: "Đơn vị",
  weight: "GW (kg)",
  note: "Ghi chú",
  port: "Cảng hạ",
  cfs: "Số tờ khai CSHT",
  warehouse: "Khai nháp",
  customsBill: "BILL tờ khai",
  receivedTime: "Time nhận ctừ",
  customsStatus: "Trạng thái tờ khai",
  customsPic: "PIC tờ khai",
  draftTime: "Giờ draft",
  transporter: "Truyền",
  transmittedBill: "BILL truyền",
  confirmTime: "Giờ confirm",
  clearance: "Số tờ khai truyền",
  transmitTime: "Giờ truyền",
  transmitStatus: "Trạng thái truyền",
  customsStage: "Công đoạn tờ khai",
  excelSource: "Dòng Excel gốc",
  sharedCells: "Ô gộp dùng chung",
  movement: "Luồng hàng",
  declarant: "Bên mở tờ khai",
  channel: "Luồng tờ khai",
  draftId: "Liên kết bản nháp",
};
const roleNames = {
  admin: "Quản trị viên",
  staff: "Nhân viên",
  viewer: "Chỉ xem",
  disabled: "Đã khóa",
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
const dateText = (d) => (d ? d.split("-").reverse().join("/") : "—");
const number = (n) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
    Number(n) || 0,
  );
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
async function api(url, method = "GET", data) {
  const r = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) {
    if (r.status === 401 && state.user) {
      state.user = null;
      await init();
    }
    throw new Error(b.error || "Không thể thực hiện");
  }
  return b;
}
async function init() {
  try {
    const a = await api("/api/auth");
    state.user = a.user;
    $("#auth").hidden = !!a.user;
    $("#app").hidden = !a.user;
    if (!a.user) {
      renderAuth(a.needsSetup, a.setupTokenRequired);
      return;
    }
    $("#profile").innerHTML =
      `<div class="profile"><span class="avatar">${esc(a.user.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(a.user.name)}</strong><small>${roleNames[a.user.role]}</small></div></div>`;
    $("#usersNav").hidden = $("#auditNav").hidden = a.user.role !== "admin";
    $("#todayLabel").textContent = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    $("#dateFilter").value = today();
    $("#addBtn").hidden =
      $("#importBtn").hidden =
      $("#emptyAdd").hidden =
        a.user.role === "viewer";
    await load();
    await switchView("plan");
    $("#usersView").innerHTML = "";
    $("#auditView").innerHTML = "";
    $("#reportsView").innerHTML = "";
  } catch (e) {
    toast(e.message);
  }
}
function renderAuth(setup, setupTokenRequired = false) {
  $("#auth").innerHTML =
    `<div class="brand">▦ <span>daily<span class="brand-light">kho</span></span></div><h1>${setup ? "Tạo tài khoản quản trị" : "Chào mừng trở lại"}</h1><p>${setup ? "Khởi tạo người quản lý đầu tiên để bắt đầu theo dõi kế hoạch kho." : "Đăng nhập để quản lý kế hoạch nhập xuất mỗi ngày."}</p>${setup ? "<p>Chỉ mở ứng dụng cho người khác sau khi đã tạo quản trị viên.</p>" : ""}<form id="authForm">${setup && setupTokenRequired ? '<label>Khóa khởi tạo<input name="setupToken" type="password" required minlength="32" autocomplete="off"></label><p>Nhập khóa SETUP_TOKEN từ trang cấu hình riêng của dịch vụ hosting. Khóa này chỉ dùng để tạo quản trị viên đầu tiên.</p>' : ""}${setup ? '<label>Họ tên<input name="name" required maxlength="100" autocomplete="name"></label>' : ""}<label>Tên đăng nhập<input name="username" required autocomplete="username" pattern="[a-zA-Z0-9._-]{3,40}" autofocus></label><label>Mật khẩu<input name="password" type="password" required ${setup ? 'minlength="10"' : ""} maxlength="200" autocomplete="${setup ? "new-password" : "current-password"}"></label><p id="authError" class="form-error" role="alert"></p><button class="btn primary">${setup ? "Tạo quản trị viên" : "Đăng nhập"} →</button></form><p><small>${setup ? "Mật khẩu ít nhất 10 ký tự. Không có tài khoản mặc định." : "Phiên đăng nhập có hiệu lực trong 12 giờ."}</small></p>`;
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      if (setup) await api("/api/setup", "POST", b);
      await api("/api/login", "POST", b);
      await init();
    } catch (err) {
      $("#authError").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
}
async function load() {
  state.rows = await api("/api/shipments");
  render();
}
function filtered() {
  const q = $("#search").value.trim().toLocaleLowerCase("vi");
  return state.rows.filter(
    (r) =>
      (state.view === "customs"
        ? r.direction === "C11" ||
          ["warehouse", "customsBill", "transporter", "transmittedBill"].some(
            (k) => r[k],
          )
        : r.direction !== "C11") &&
      (!$("#dateFilter").value || r.date === $("#dateFilter").value) &&
      (!state.direction ||
        (state.view === "customs" ? r.customsStage : r.direction) ===
          state.direction) &&
      (!$("#statusFilter").value || r.status === $("#statusFilter").value) &&
      (!q ||
        (Object.values(labels).length &&
          Object.keys(labels).some((k) =>
            String(r[k] || "")
              .toLocaleLowerCase("vi")
              .includes(q),
          ))),
  );
}
function badge(status) {
  return `<span class="badge ${status === "Hoàn tất" ? "green" : status === "Đang xử lý" ? "amber" : "gray"}">● ${esc(status)}</span>`;
}
function render() {
  const rows = filtered();
  const total = rows.length,
    done = rows.filter((r) => r.status === "Hoàn tất").length;
  const ni = rows.filter((r) => r.direction === "Nhập"),
    no = rows.filter((r) => r.direction === "Xuất");
  const statCards = [
    [
      state.view === "customs" ? "Tổng hồ sơ tờ khai" : "Tổng lô hàng",
      total,
      state.view === "customs" ? "mục" : "lô",
      "▤",
      `${done}/${total} đã hoàn tất`,
    ],
    [
      "Hàng nhập",
      ni.length,
      "lô",
      "↓",
      `${number(ni.reduce((s, r) => s + Number(r.packages), 0))} kiện · ${number(ni.reduce((s, r) => s + Number(r.weight), 0))} kg`,
    ],
    [
      "Hàng xuất",
      no.length,
      "lô",
      "↑",
      `${number(no.reduce((s, r) => s + Number(r.packages), 0))} kiện · ${number(no.reduce((s, r) => s + Number(r.weight), 0))} kg`,
    ],
    ["Cần xử lý", total - done, "lô", "◷", "Lô chờ xử lý & đang xử lý"],
  ];
  if (state.view === "customs") {
    statCards[1] = [
      "Khai nháp",
      rows.filter((r) => r.customsStage === "Khai nháp").length,
      "mục",
      "▱",
      "Danh sách khai nháp độc lập",
    ];
    statCards[2] = [
      "Truyền",
      rows.filter((r) => r.customsStage === "Truyền").length,
      "mục",
      "↑",
      "Danh sách truyền độc lập",
    ];
    statCards[3] = [
      "Cần xử lý",
      total - done,
      "mục",
      "◷",
      "Bản ghi chưa hoàn tất",
    ];
  }
  $("#stats").innerHTML = statCards
    .map(
      ([label, value, unit, icon, foot]) =>
        `<div class="stat"><div class="stat-label">${label}</div><span class="stat-icon">${icon}</span><div class="stat-value">${number(value)}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`,
    )
    .join("");
  if (state.view !== "customs")
    for (const [i, group] of [
      [1, ni],
      [2, no],
    ])
      if (group.length && group.every((r) => !r.packages && !r.weight))
        $("#stats").children[i].querySelector(".stat-foot").textContent =
          "Chưa ghi số kiện / GW";
  $("#rowCount").textContent = total;
  $("#empty").hidden = total > 0;
  $("#tableSummary").textContent =
    `${total} ${state.view === "customs" ? "mục C11" : "lô hàng"}${$("#dateFilter").value ? " · " + dateText($("#dateFilter").value) : " · Tất cả ngày"}`;
  $("#empty h3").textContent = state.rows.length
    ? "Không có kết quả phù hợp"
    : "Chưa có lô hàng";
  $("#empty p").textContent = state.rows.length
    ? "Đổi ngày hoặc bộ lọc để xem các lô hàng khác."
    : "Tạo lô hàng đầu tiên hoặc nhập kế hoạch từ Excel.";
  const customs = state.view === "customs";
  $("#listTitle").textContent = customs
    ? "Tiến độ khai nháp & truyền"
    : "Danh sách lô hàng";
  const columns = customs
    ? [
        "Khách / Ngày",
        "Công đoạn",
        "Khai nháp",
        "BILL nháp",
        "Time nhận ctừ",
        "Trạng thái nháp",
        "PIC",
        "Time draft",
        "Truyền",
        "BILL truyền",
        "Confirm",
        "Thông quan",
        "Time truyền",
        "Trạng thái truyền",
        "Luồng tờ khai",
        "Nguồn",
        "",
      ]
    : [
        "Khách / Ngày",
        "Loại",
        "Số tờ khai",
        "Mã loại hình",
        "Luồng hàng",
        "Bên mở tờ khai",
        "INV / Hóa đơn",
        "BILL",
        "Ngày tờ khai",
        "SL phiếu",
        "SL kiện",
        "Đơn vị",
        "GW (kg)",
        "Trạng thái",
        "PIC",
        "Ghi chú",
        "Cảng hạ",
        "Số tờ khai CSHT",
        "Nguồn / Ô gộp",
        "",
      ];
  $("#tableHead").innerHTML =
    "<tr>" + columns.map((h) => `<th>${h}</th>`).join("") + "</tr>";
  $("#tableBody").innerHTML = rows
    .map((r) => {
      const cell = (value, cls = "") =>
        `<td class="${cls}">${value === undefined || value === "" ? "—" : esc(value)}</td>`;
      const first = `<td><button class="row-button" data-edit="${r.id}"><strong>${esc(r.customer)}</strong></button><span class="sub">${dateText(r.date)}</span></td>`;
      const source = `<td class="source-cell">${esc(r.excelSource) || "Nhập trực tiếp"}${r.sharedCells ? `<details><summary>Ô gộp dùng chung</summary>${esc(r.sharedCells)}</details>` : ""}</td>`;
      const cells = customs
        ? [
            "customsStage",
            "warehouse",
            "customsBill",
            "receivedTime",
            "customsStatus",
            "customsPic",
            "draftTime",
            "transporter",
            "transmittedBill",
            "confirmTime",
            "clearance",
            "transmitTime",
            "transmitStatus",
            "channel",
          ]
            .map((k) => cell(r[k]))
            .join("") + source
        : `<td><span class="direction ${r.direction === "Xuất" ? "out" : ""}">${r.direction === "Nhập" ? "↓" : "↑"} ${esc(r.direction)}</span></td>` +
          cell(r.declaration, "mono") +
          cell(r.type) +
          cell(r.movement) +
          cell(r.declarant) +
          cell(r.invoice, "mono") +
          cell(r.bill, "mono") +
          cell(r.plannedDate ? dateText(r.plannedDate) : "") +
          cell(r.slips) +
          cell(r.packages === "" ? "" : number(r.packages)) +
          cell(r.unit) +
          cell(r.weight === "" ? "" : number(r.weight)) +
          `<td>${badge(r.status)}</td>` +
          ["pic", "note", "port", "cfs"].map((k) => cell(r[k])).join("") +
          source;
      return `<tr>${first}${cells}<td><button class="icon-btn" data-edit="${r.id}" aria-label="${state.user.role === "viewer" ? "Xem" : "Sửa"} lô ${esc(r.customer)}">…</button></td></tr>`;
    })
    .join("");
  $$("[data-edit]").forEach(
    (b) => (b.onclick = () => edit(Number(b.dataset.edit))),
  );
  if (customs && state.user.role !== "viewer")
    $$("#tableBody tr").forEach((tr, i) => {
      if (rows[i].customsStage === "Khai nháp") {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn small";
        b.textContent = "Confirm truyền";
        b.onclick = () => {
          const d = rows[i];
          edit();
          state.edit = null;
          state.linkDraft = d.id;
          $("#shipmentForm [name=customer]").value = d.customer;
          const stage = $("#shipmentForm [name=customsStage]");
          stage.value = "Truyền";
          stage.dispatchEvent(new Event("change"));
          $("#shipmentForm [name=transmittedBill]").value = d.customsBill;
        };
        tr.lastElementChild.append(b);
      }
    });
}
const groups = {
  mainFields: [
    "date",
    "direction",
    "customer",
    "declaration",
    "type",
    "movement",
    "declarant",
    "plannedDate",
    "invoice",
    "bill",
    "status",
    "pic",
  ],
  cargoFields: ["slips", "packages", "unit", "weight", "port", "cfs", "note"],
  customsFields: [
    "warehouse",
    "customsBill",
    "receivedTime",
    "customsStatus",
    "customsPic",
    "draftTime",
    "transporter",
    "transmittedBill",
    "confirmTime",
    "clearance",
    "transmitTime",
    "transmitStatus",
    "channel",
  ],
};
function field(k, value) {
  let input;
  const required = ["date", "direction", "customer", "status"].includes(k);
  if (["channel", "movement"].includes(k)) {
    const values =
      k === "channel"
        ? ["", "Xanh", "Vàng", "Đỏ"]
        : [
            "",
            "Nội địa → Kho",
            "Nước ngoài → Kho",
            "Kho → Nội địa",
            "Kho → Nước ngoài",
            "Kho → CFS",
            "Kho → Nước ngoài / CFS",
          ];
    input = `<select name="${k}" aria-label="${labels[k]}">${values.map((v) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(v) || (k === "channel" ? "Chưa phân luồng" : "Theo đầu số tờ khai")}</option>`).join("")}</select>`;
  } else if (["direction", "status", "customsStage"].includes(k)) {
    const opts =
      k === "customsStage"
        ? ["Khai nháp", "Truyền"]
        : k === "direction"
          ? ["Nhập", "Xuất"]
          : ["Chờ xử lý", "Đang xử lý", "Hoàn tất"];
    input = `<select name="${k}" aria-label="${labels[k]} *" required>${opts.map((o) => `<option ${o === value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  } else if (k === "note")
    input = `<textarea name="${k}" maxlength="2000" rows="2">${esc(value)}</textarea>`;
  else
    input = `<input ${k === "declarant" ? "readonly" : ""} name="${k}" type="${k === "date" || k === "plannedDate" ? "date" : ["packages", "weight", "slips"].includes(k) ? "number" : k.endsWith("Time") ? "time" : "text"}" value="${esc(value)}" ${required ? "required" : ""} ${["packages", "weight", "slips"].includes(k) ? `min="0" step="${k !== "weight" ? "1" : "any"}"` : 'maxlength="2000"'}>`;
  return `<label>${labels[k]}${required ? " *" : ""}${input}</label>`;
}
function edit(id) {
  state.linkDraft = null;
  state.edit = id ? state.rows.find((r) => r.id === id) : null;
  const isCustoms = state.edit
    ? state.edit.direction === "C11"
    : state.view === "customs";
  const r = state.edit || {
    date: $("#dateFilter").value || today(),
    direction: isCustoms ? "C11" : state.direction || "Nhập",
    customsStage: isCustoms ? state.direction || "Khai nháp" : "",
    status: "Chờ xử lý",
    pic: state.user.name,
    customsPic: state.user.name,
    unit: "",
  };
  const read = state.user.role === "viewer";
  $("#editTitle").textContent = read
    ? "Chi tiết lô hàng"
    : id
      ? "Cập nhật lô hàng"
      : "Tạo lô hàng";
  const activeGroups = {
    ...groups,
    mainFields: isCustoms
      ? ["date", "customer", "customsStage", "status"]
      : groups.mainFields,
  };
  for (const [group, keys] of Object.entries(activeGroups))
    $("#" + group).innerHTML = keys.map((k) => field(k, r[k] ?? "")).join("");
  $("#cargoFields").hidden = isCustoms;
  $("#cargoFields").previousElementSibling.hidden = isCustoms;
  $("#customsDetails").hidden = !isCustoms;
  $("#customsDetails").open = isCustoms;
  if (isCustoms) {
    const syncStage = () => {
      const stage = $("#shipmentForm [name=customsStage]").value;
      const allowed =
        stage === "Khai nháp"
          ? [
              "customsBill",
              "receivedTime",
              "customsStatus",
              "customsPic",
              "draftTime",
            ]
          : [
              "transmittedBill",
              "confirmTime",
              "clearance",
              "transmitTime",
              "transmitStatus",
              "channel",
            ];
      $$("#customsFields label").forEach((l) => {
        const input = l.querySelector("input,select,textarea");
        l.hidden = !allowed.includes(input.name);
        input.disabled = read || l.hidden;
      });
    };
    $("#shipmentForm [name=customsStage]").onchange = syncStage;
    setTimeout(syncStage, 0);
  }
  if (!isCustoms) {
    const infer = () => {
      const declaration = $("#shipmentForm [name=declaration]").value.trim(),
        direction = $("#shipmentForm [name=direction]").value;
      const prefix = /^\d+$/.test(declaration) ? declaration[0] : "";
      const movement = $("#shipmentForm [name=movement]"),
        who = $("#shipmentForm [name=declarant]");
      who.value = "";
      if (direction === "Nhập" && prefix === "3") {
        movement.value = "Nội địa → Kho";
        who.value = "Khách hàng";
      } else if (direction === "Nhập" && prefix === "1") {
        movement.value = "Nước ngoài → Kho";
        who.value = "Kho";
      } else if (direction === "Xuất" && prefix === "1") {
        movement.value = "Kho → Nội địa";
        who.value = "Khách hàng";
      } else if (direction === "Xuất" && prefix === "5") {
        if (!["Kho → Nước ngoài", "Kho → CFS"].includes(movement.value))
          movement.value = "Kho → Nước ngoài / CFS";
        who.value = "Kho";
      }
    };
    $("#shipmentForm [name=declaration]").oninput = infer;
    $("#shipmentForm [name=direction]").onchange = infer;
    const outbound = () => {
      const isOut = $("#shipmentForm [name=direction]").value === "Xuất";
      for (const name of ["slips", "port", "cfs"]) {
        const input = $(`#shipmentForm [name=${name}]`);
        input.closest("label").hidden = !isOut;
      }
    };
    $("#shipmentForm [name=direction]").onchange = () => {
      infer();
      outbound();
    };
    infer();
    outbound();
  }
  let source = $("#sourceInfo");
  if (!source) {
    source = document.createElement("p");
    source.id = "sourceInfo";
    source.className = "info-note";
    $("#mainFields").after(source);
  }
  source.textContent = [r.excelSource, r.sharedCells]
    .filter(Boolean)
    .join(" · ");
  $$("#shipmentForm input,#shipmentForm select,#shipmentForm textarea").forEach(
    (i) => (i.disabled = read),
  );
  for (const key of ["packages", "weight"]) {
    const input = $(`#shipmentForm [name=${key}]`);
    if (
      state.edit &&
      state.edit[key] === "" &&
      (state.edit.sharedCells || "").includes(labels[key] + ":")
    )
      input.readOnly = true;
  }
  $("#saveBtn").hidden = read;
  $("#deleteBtn").hidden = !id || state.user.role !== "admin";
  $("#editError").textContent = "";

  $("#editDialog").showModal();
}
$("#shipmentForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#saveBtn").disabled = true;
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const isCustoms = state.edit
      ? state.edit.direction === "C11"
      : state.view === "customs";
    if (isCustoms) {
      data.direction = "C11";
      if (data.customsStage === "Khai nháp") data.warehouse = data.customer;
      else data.transporter = data.customer;
    }
    if (state.edit?.draftId) data.draftId = state.edit.draftId;
    if (state.linkDraft) data.draftId = state.linkDraft;
    if (state.edit) data.version = state.edit.version;
    await api(
      "/api/shipments" + (state.edit ? "/" + state.edit.id : ""),
      state.edit ? "PUT" : "POST",
      data,
    );
    $("#editDialog").close();
    await load();
    toast("Đã lưu lô hàng");
  } catch (err) {
    $("#editError").textContent = err.message;
  } finally {
    $("#saveBtn").disabled = false;
  }
};
$("#deleteBtn").onclick = async () => {
  if (
    !confirm(
      "Xóa lô hàng này? Không thể khôi phục trực tiếp. Lịch sử xóa được giữ lại.",
    )
  )
    return;
  try {
    await api("/api/shipments/" + state.edit.id, "DELETE", {
      version: state.edit.version,
    });
    $("#editDialog").close();
    await load();
    toast("Đã xóa lô hàng");
  } catch (e) {
    $("#editError").textContent = e.message;
  }
};
$("#addBtn").onclick = $("#emptyAdd").onclick = () => edit();
$$(".close-dialog").forEach(
  (b) => (b.onclick = () => b.closest("dialog").close()),
);
$("#search").oninput = render;
$("#dateFilter").onchange = $("#statusFilter").onchange = render;
$$("[data-direction]").forEach(
  (b) =>
    (b.onclick = () => {
      state.direction = b.dataset.direction;
      $$("[data-direction]").forEach((x) =>
        x.classList.toggle("active", x === b),
      );
      render();
    }),
);
$("#refresh").onclick = async () => {
  try {
    await load();
    toast("Đã tải dữ liệu mới nhất");
  } catch (e) {
    toast(e.message);
  }
};
$("#logout").onclick = async () => {
  try {
    await api("/api/logout", "POST");
    state.user = null;
    state.view = "plan";
    await init();
  } catch (e) {
    toast(e.message);
  }
};
$("#exportBtn").onclick = () => {
  const date = $("#dateFilter").value;
  location.href =
    "/api/export" + (date ? "?date=" + encodeURIComponent(date) : "");
  toast("Xuất tất cả mục của ngày đã chọn, gồm nhập, xuất và C11.");
};
$("#importBtn").onclick = () => {
  state.importRows = [];
  $("#excelFile").value = "";
  $("#importPreview").innerHTML = "";
  $("#importError").textContent = "";
  $("#confirmImport").disabled = true;
  $("#importDialog").showModal();
};
$("#excelFile").onchange = async (e) => {
  const file = e.target.files[0];
  state.importRows = [];
  $("#confirmImport").disabled = true;
  $("#importError").textContent = "";
  $("#importPreview").textContent = "Đang kiểm tra tệp…";
  if (!file) {
    $("#importPreview").textContent = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $("#importError").textContent = "Tệp tối đa 5 MB";
    $("#importPreview").textContent = "";
    return;
  }
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Không đọc được tệp"));
      reader.readAsDataURL(file);
    });
    const result = await api("/api/import/preview", "POST", { file: data });
    state.importRows = result.rows;
    $("#importError").textContent = result.errors.join("\n");
    $("#importPreview").innerHTML =
      `<p><strong>${result.rows.length} dòng hợp lệ</strong> · ${result.errors.length} lỗi. Dữ liệu chưa được lưu.</p><p>${esc(result.format)} · Nhập ${result.summary?.inbound || 0}, xuất ${result.summary?.outbound || 0}, khai nháp ${result.summary?.draft || 0}, truyền ${result.summary?.transmit || 0}. ${result.duplicates || 0} bản ghi nguồn đã có sẽ được bỏ qua.</p>${(result.warnings || []).map((w) => `<p>${esc(w)}</p>`).join("")}<p>Mẫu phẳng không có mã nguồn vẫn tạo mới; hãy tránh nhập lại.</p><table><thead><tr><th>Ngày</th><th>Loại</th><th>Khách</th><th>Tờ khai</th></tr></thead><tbody>${result.rows
        .slice(0, 20)
        .map(
          (r) =>
            `<tr><td>${dateText(r.date)}</td><td>${r.direction}</td><td>${esc(r.customer)}</td><td>${esc(r.declaration)}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table>${result.rows.length > 20 ? "<p>Hiển thị 20 dòng đầu.</p>" : ""}`;
    $("#confirmImport").disabled =
      !result.rows.length || !!result.errors.length;
  } catch (err) {
    $("#importPreview").textContent = "";
    $("#importError").textContent = err.message;
  }
};
$("#confirmImport").onclick = async () => {
  $("#confirmImport").disabled = true;
  try {
    const r = await api("/api/import", "POST", { rows: state.importRows });
    $("#importDialog").close();
    await load();
    toast(
      `Đã nhập ${r.count} mục, bỏ qua ${r.skipped || 0} mục trùng. Đổi ngày lọc để xem nếu cần.`,
    );
  } catch (e) {
    $("#importError").textContent = e.message;
    $("#confirmImport").disabled = false;
  }
};
async function switchView(view) {
  if (state.view !== view) state.direction = "";
  state.view = view;
  const customs = view === "customs";
  $$(".tab").forEach((b, i) => {
    b.dataset.direction = customs
      ? ["", "Khai nháp", "Truyền"][i]
      : ["", "Nhập", "Xuất"][i];
    b.textContent = customs
      ? ["Tất cả", "Khai nháp", "Truyền"][i]
      : ["Tất cả", "↓ Hàng nhập", "↑ Hàng xuất"][i];
    b.classList.toggle("active", b.dataset.direction === state.direction);
  });
  $("#addBtn").textContent = customs ? "＋ Tạo mục tờ khai" : "＋ Tạo lô hàng";
  $("#emptyAdd").textContent = customs
    ? "＋ Tạo mục tờ khai"
    : "＋ Tạo lô hàng";
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  const title = {
    plan: "Kế hoạch hàng ngày",
    customs: "Khai nháp & truyền",
    users: "Thành viên",
    audit: "Lịch sử thao tác",
    reports: "Báo cáo & Google Drive",
  }[view];
  $("#pageTitle").textContent = $("#breadcrumb").textContent = title;
  $("#pageDescription").textContent = {
    plan: "Theo dõi từng lô hàng. Chủ động mọi tiến độ.",
    customs: "Theo dõi nhận chứng từ, draft, xác nhận và thông quan.",
    users: "Phân quyền rõ ràng cho từng người trong đội ngũ.",
    audit: "Ghi nhận các thay đổi dữ liệu và tài khoản trên hệ thống.",
    reports: "Báo cáo tháng và trạng thái cập nhật Excel lên Google Drive.",
  }[view];
  $("#planView").hidden = !["plan", "customs"].includes(view);
  $("#planActions").hidden = !["plan", "customs"].includes(view);
  $("#usersView").hidden = view !== "users";
  $("#auditView").hidden = view !== "audit";
  $("#reportsView").hidden = view !== "reports";
  if (view === "reports") await renderReports();
  else if (view === "users") await renderUsers();
  else if (view === "audit") await renderAudit();
  else render();
}
$$("[data-view]").forEach(
  (b) =>
    (b.onclick = () =>
      switchView(b.dataset.view).catch((e) => toast(e.message))),
);
async function renderUsers() {
  const users = await api("/api/users");
  $("#usersView").innerHTML =
    `<section class="panel"><div class="user-heading"><h2>Thành viên (${users.length})</h2><button class="btn primary" id="newUser">＋ Thêm thành viên</button></div><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Đặt lại mật khẩu</th></tr></thead><tbody>${users
      .map(
        (u) =>
          `<tr><td><strong>${esc(u.name)}</strong>${u.id === state.user.id ? ' <span class="badge green">Bạn</span>' : ""}</td><td>${esc(u.username)}</td><td><select class="role-select" data-role="${u.id}" aria-label="Vai trò của ${esc(u.name)}">${Object.entries(
            roleNames,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === u.role ? "selected" : ""}>${v}</option>`,
            )
            .join(
              "",
            )}</select></td><td><button class="btn small" data-reset="${u.id}">Đặt lại</button></td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div></section><p>Quản trị viên: toàn quyền. Nhân viên: xem, thêm, sửa và nhập Excel. Chỉ xem: xem và xuất Excel. Đổi quyền hoặc mật khẩu sẽ đăng xuất các phiên của tài khoản đó.</p>`;
  $("#newUser").onclick = () => {
    $("#userForm").reset();
    $("#userError").textContent = "";
    $("#userDialog").showModal();
  };
  $$("[data-role]").forEach(
    (s) =>
      (s.onchange = async () => {
        try {
          await api("/api/users/" + s.dataset.role, "PATCH", { role: s.value });
          if (Number(s.dataset.role) === state.user.id) {
            await init();
            return;
          }
          await renderUsers();
          toast("Đã cập nhật quyền");
        } catch (e) {
          toast(e.message);
          await renderUsers();
        }
      }),
  );
  $$("[data-reset]").forEach(
    (b) =>
      (b.onclick = () =>
        openReset(users.find((u) => u.id === Number(b.dataset.reset)))),
  );
}
function openReset(user) {
  const d = document.createElement("dialog");
  d.innerHTML = `<form><div class="dialog-header"><h2>Đặt lại mật khẩu</h2></div><div class="dialog-body"><p>Tài khoản: ${esc(user.username)}</p><label>Mật khẩu mới <input type="password" name="password" required minlength="10" maxlength="200" autocomplete="new-password"></label><p class="form-error" role="alert"></p></div><div class="dialog-footer"><button class="btn" type="button">Hủy</button><button class="btn primary">Lưu mật khẩu</button></div></form>`;
  document.body.append(d);
  d.querySelector("[type=button]").onclick = () => d.close();
  d.onclose = () => d.remove();
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/users/" + user.id, "PATCH", {
        role: user.role,
        password: new FormData(e.target).get("password"),
      });
      d.close();
      toast("Đã đổi mật khẩu");
      if (user.id === state.user.id) await init();
    } catch (err) {
      d.querySelector(".form-error").textContent = err.message;
    }
  };
  d.showModal();
}
$("#userForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn =
    e.target.querySelector("[type=submit]") ||
    e.target.querySelector(".btn.primary");
  btn.disabled = true;
  try {
    await api("/api/users", "POST", Object.fromEntries(new FormData(e.target)));
    $("#userDialog").close();
    await renderUsers();
    toast("Đã tạo tài khoản");
  } catch (err) {
    $("#userError").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
};
async function renderAudit() {
  const rows = await api("/api/audit");
  $("#auditView").innerHTML =
    `<section class="panel"><div class="panel-heading"><h2>200 thao tác gần nhất</h2></div><div class="table-wrap"><table><thead><tr><th>Thời gian (VN)</th><th>Người thực hiện</th><th>Thao tác</th><th>Lô hàng</th><th>Chi tiết</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${new Date(r.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td><td>${esc(r.name) || "Khởi tạo"}</td><td>${esc(r.action)}</td><td>${r.record_id || "—"}</td><td class="audit-detail">${r.detail ? `<details><summary>Xem dữ liệu trước thay đổi</summary><pre>${esc(r.detail)}</pre></details>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
}
async function renderReports() {
  const sync = await api("/api/drive/status"),
    admin = state.user.role === "admin";
  $("#reportsView").innerHTML =
    `<section class="panel"><div class="panel-heading"><h2>Báo cáo tháng</h2></div><div class="dialog-body"><p>Chi tiết nhập/xuất, khai nháp, confirm truyền và tổng hợp theo ngày, khách hàng, PIC; tách số kiện theo đơn vị.</p><label>Chọn tháng <input id="reportMonth" type="month" value="${today().slice(0, 7)}"></label> <button class="btn primary" id="downloadMonth">Tải Excel báo cáo</button></div></section><section class="panel drive-panel"><div class="panel-heading"><h2>Google Drive</h2><button class="btn small" id="refreshDrive">Tải lại trạng thái</button></div><div class="dialog-body"><p>${sync.connected ? "Đã kết nối. Tự cập nhật một file mỗi tháng trong thư mục Daily Kho." : sync.configured ? "Chưa kết nối. Quản trị viên cần cấp quyền truy cập Google Drive." : "Chưa cấu hình Google Drive trên máy chủ. Báo cáo Excel vẫn tải được; dữ liệu chưa được gửi lên Google."}</p><p>Dữ liệu được lưu vào ứng dụng trước, rồi đồng bộ nền trong khoảng 10 giây khi Google hoạt động bình thường. Có lỗi sẽ thử lại. File chỉ nằm trong tài khoản Google đã kết nối, không tự công khai.</p>${admin ? `<button class="btn primary" id="connectDrive" ${!sync.configured ? "disabled" : ""}>${sync.connected ? "Kết nối lại" : "Kết nối Google Drive"}</button> ${sync.connected ? '<button class="btn" id="retryDrive">Thử đồng bộ lại</button> <button class="btn danger" id="disconnectDrive">Ngắt kết nối</button>' : ""}` : ""}<div class="table-wrap"><table><thead><tr><th>Tháng</th><th>Trạng thái</th><th>Đồng bộ gần nhất</th><th>Excel trên Drive</th><th>Lỗi</th></tr></thead><tbody>${sync.jobs.map((j) => `<tr><td>${j.month}</td><td>${j.pending ? (sync.connected ? "Chờ đồng bộ" : "Chưa kết nối") : "Đã đồng bộ"}</td><td>${j.synced_at ? new Date(j.synced_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—"}</td><td>${j.url ? `<a class="text-link" href="${esc(j.url)}" target="_blank" rel="noopener">Mở file</a>` : "—"}</td><td class="source-cell">${esc(j.error) || "—"}</td></tr>`).join("")}</tbody></table></div><p class="form-error" id="driveError" role="alert"></p></div></section>`;
  $("#downloadMonth").onclick = () => {
    const m = $("#reportMonth").value;
    if (!m) {
      toast("Chọn tháng báo cáo");
      return;
    }
    location.href = "/api/report?month=" + encodeURIComponent(m);
  };
  $("#refreshDrive").onclick = () =>
    renderReports().catch((e) => toast(e.message));
  if (admin) {
    $("#connectDrive").onclick = async () => {
      try {
        location.href = (await api("/api/drive/connect", "POST")).url;
      } catch (e) {
        $("#driveError").textContent = e.message;
      }
    };
    if (sync.connected) {
      $("#retryDrive").onclick = async () => {
        try {
          await api("/api/drive/retry", "POST");
          toast("Đã yêu cầu thử lại. Tải lại trạng thái sau ít giây.");
        } catch (e) {
          $("#driveError").textContent = e.message;
        }
      };
      $("#disconnectDrive").onclick = async () => {
        if (!confirm("Ngắt đồng bộ? File trên Drive vẫn được giữ.")) return;
        try {
          await api("/api/drive/disconnect", "POST");
          await renderReports();
        } catch (e) {
          $("#driveError").textContent = e.message;
        }
      };
    }
  }
}
init();
