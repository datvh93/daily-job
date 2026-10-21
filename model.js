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
  clearance: "Số thông quan",
  transmitTime: "Giờ truyền",
  transmitStatus: "Trạng thái truyền",
  customsStage: "Công đoạn C11",
  excelSource: "Dòng Excel gốc",
  sharedCells: "Ô gộp dùng chung",
  importKey: "Mã chống nhập trùng",
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
  return d;
}

module.exports = { fields, statuses, fail, validate };
