"use strict";
const fields = {
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
  importKey: "Mã chống nhập trùng",
  movement: "Luồng hàng",
  declarant: "Bên mở tờ khai",
  channel: "Luồng tờ khai",
  draftId: "Liên kết bản nháp",
};
const statuses = ["Chờ xử lý", "Đang xử lý", "Hoàn tất"];
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
function validate(input) {
  const d = {};
  for (const key of Object.keys(fields)) {
    const value = input[key] ?? "";
    if (typeof value !== "string" && typeof value !== "number")
      fail("Dữ liệu không hợp lệ: " + fields[key]);
    d[key] = String(value).trim();
    if (d[key].length > 2000) fail("Nội dung quá dài: " + fields[key]);
  }
  if (!validDate(d.date)) fail("Ngày XN không hợp lệ");
  if (d.plannedDate && !validDate(d.plannedDate))
    fail("Ngày tờ khai không hợp lệ");
  if (!["Nhập", "Xuất", "C11"].includes(d.direction))
    fail("Chọn Nhập, Xuất hoặc C11");
  if (d.customsStage && !["Khai nháp", "Truyền"].includes(d.customsStage))
    fail("Công đoạn C11 không hợp lệ");
  if (!d.customer) fail("Vui lòng nhập tên khách");
  if (!statuses.includes(d.status)) fail("Trạng thái không hợp lệ");
  for (const key of ["packages", "weight", "slips"]) {
    if (!Number.isFinite(Number(d[key])) || Number(d[key]) < 0)
      fail(fields[key] + " phải là số không âm");
  }
  for (const key of ["packages", "slips"])
    if (!Number.isInteger(Number(d[key])))
      fail(fields[key] + " phải là số nguyên");
  for (const k of ["receivedTime", "draftTime", "confirmTime", "transmitTime"])
    if (d[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d[k]))
      fail("Giờ phải có dạng HH:mm");
  if (d.channel && !["Xanh", "Vàng", "Đỏ"].includes(d.channel))
    fail("Luồng tờ khai phải là Xanh, Vàng hoặc Đỏ");
  if (d.draftId && !/^\d+$/.test(d.draftId))
    fail("Liên kết bản nháp không hợp lệ");
  const category = classify(d);
  d.movement = category.movement;
  d.declarant = category.declarant;
  return d;
}

function classify(d) {
  const p = /^\d+$/.test(d.declaration || "") ? d.declaration[0] : "";
  let movement = d.movement || "",
    declarant = "";
  if (d.direction === "Nhập" && p === "3") {
    movement = "Nội địa → Kho";
    declarant = "Khách hàng";
  }
  if (d.direction === "Nhập" && p === "1") {
    movement = "Nước ngoài → Kho";
    declarant = "Kho";
  }
  if (d.direction === "Xuất" && p === "1") {
    movement = "Kho → Nội địa";
    declarant = "Khách hàng";
  }
  if (d.direction === "Xuất" && p === "5") {
    movement = ["Kho → Nước ngoài", "Kho → CFS"].includes(movement)
      ? movement
      : "Kho → Nước ngoài / CFS";
    declarant = "Kho";
  }
  if (d.direction === "C11") declarant = "Kho";
  if (
    movement &&
    ![
      "Nội địa → Kho",
      "Nước ngoài → Kho",
      "Kho → Nội địa",
      "Kho → Nước ngoài",
      "Kho → CFS",
      "Kho → Nước ngoài / CFS",
    ].includes(movement)
  )
    fail("Luồng hàng không hợp lệ");
  if (
    movement &&
    d.direction === "Nhập" &&
    !["Nội địa → Kho", "Nước ngoài → Kho"].includes(movement)
  )
    fail("Luồng hàng không khớp chiều nhập");
  if (movement && d.direction === "Xuất" && !movement.startsWith("Kho → "))
    fail("Luồng hàng không khớp chiều xuất");
  if (!declarant && movement)
    declarant = ["Nội địa → Kho", "Kho → Nội địa"].includes(movement)
      ? "Khách hàng"
      : "Kho";
  return { movement, declarant };
}
module.exports = { fields, statuses, fail, validate, classify };
