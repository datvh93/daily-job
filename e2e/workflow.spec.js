const { test, expect } = require("@playwright/test");
test("Khởi tạo, nhập xuất lô hàng, Excel và giao diện di động", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator("#authForm")
    .getByLabel("Họ tên", { exact: true })
    .fill("Quản lý kho");
  await page
    .locator("#authForm")
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill("quanlykho");
  await page
    .locator("#authForm")
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Browser-Test-Password-123");
  await page.getByRole("button", { name: "Tạo quản trị viên" }).click();
  await expect(page.locator("#pageTitle")).toHaveText("Kế hoạch hàng ngày");
  await expect(page.locator("#empty")).toBeVisible();
  await page.locator("#addBtn").click();
  await page.getByLabel("Tên khách *", { exact: true }).fill("SUNWA");
  await page.getByLabel("Số tờ khai", { exact: true }).fill("001234567890");
  await page.getByLabel("SL kiện", { exact: true }).fill("30");
  await page.getByLabel("GW (kg)", { exact: true }).fill("1122");
  await page.getByRole("button", { name: "Lưu lô hàng", exact: true }).click();
  await expect(page.locator("#tableBody")).toContainText("SUNWA");
  await page
    .getByRole("button", { name: "SUNWA", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Trạng thái *", { exact: true })
    .selectOption("Hoàn tất");
  await page.getByRole("button", { name: "Lưu lô hàng", exact: true }).click();
  await expect(page.locator("#tableBody")).toContainText("Hoàn tất");
  await page
    .getByRole("button", { name: "Khai nháp & truyền", exact: false })
    .click();
  await expect(page.locator("#tableBody tr")).toHaveCount(0);
  await page.locator("#addBtn").click();
  await page.getByLabel("Tên khách *", { exact: true }).fill("SUNWA");
  await page.getByLabel("BILL tờ khai", { exact: true }).fill("878907074022");
  await page.getByLabel("Time nhận ctừ", { exact: true }).fill("08:33");
  await page.getByLabel("Trạng thái tờ khai", { exact: true }).fill("OK");
  await page.getByRole("button", { name: "Lưu lô hàng", exact: true }).click();
  await expect(page.locator("#tableBody")).toContainText("878907074022");
  const excel = await page.request.get("/api/export");
  await page.locator("#importBtn").click();
  await page.locator("#excelFile").setInputFiles({
    name: "ke-hoach.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await excel.body(),
  });
  await expect(page.locator("#importPreview")).toContainText("2 dòng hợp lệ");
  await page.locator("#confirmImport").click();
  await expect(page.locator("#tableBody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Confirm truyền", exact: true })
    .first()
    .click();
  await page.getByLabel("Giờ confirm", { exact: true }).fill("14:24");
  await page
    .getByLabel("Số tờ khai truyền", { exact: true })
    .fill("00108742005960");
  await page.getByLabel("Giờ truyền", { exact: true }).fill("14:30");
  await page.getByLabel("Luồng tờ khai", { exact: true }).selectOption("Vàng");
  await page.getByRole("button", { name: "Lưu lô hàng", exact: true }).click();
  await expect(page.locator("#tableBody")).toContainText("Vàng");
  await page.locator("[data-view=reports]").click();
  await expect(page.locator("#reportsView")).toContainText(
    "Chưa cấu hình Google Drive",
  );
  await expect(page.locator("#connectDrive")).toBeDisabled();
  const reportDownload = page.waitForEvent("download");
  await page.locator("#downloadMonth").click();
  expect((await reportDownload).suggestedFilename()).toMatch(
    /^Daily-Kho-.*xlsx$/,
  );
  await page.getByRole("button", { name: "Thành viên", exact: false }).click();
  await page
    .getByRole("button", { name: "Thêm thành viên", exact: false })
    .click();
  await page.locator("#userForm [name=name]").fill("Người xem");
  await page.locator("#userForm [name=username]").fill("nguoixem");
  await page
    .locator("#userForm [name=password]")
    .fill("Viewer-Test-Password-123");
  await page.locator("#userForm [name=role]").selectOption("viewer");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page.locator("#usersView")).toContainText("nguoixem");
  await page.getByRole("button", { name: "Đăng xuất", exact: false }).click();
  await page
    .locator("#authForm")
    .getByLabel("Tên đăng nhập", { exact: true })
    .fill("nguoixem");
  await page
    .locator("#authForm")
    .getByLabel("Mật khẩu", { exact: true })
    .fill("Viewer-Test-Password-123");
  await page.getByRole("button", { name: "Đăng nhập", exact: false }).click();
  await expect(page.locator("#pageTitle")).toHaveText("Kế hoạch hàng ngày");
  await expect(page.locator("#addBtn")).toBeHidden();
  await expect(page.locator("#usersNav")).toBeHidden();
  await page
    .getByRole("button", { name: "SUNWA", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Tên khách *", { exact: true })).toBeDisabled();
  await expect(page.locator("#saveBtn")).toBeHidden();
  await page.locator("#editDialog .close-dialog").first().click();
  const download = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  expect((await download).suggestedFilename()).toMatch(/xlsx$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#stats")).toBeVisible();
  await expect(page.locator("#tableBody")).toContainText("SUNWA");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/daily-kho-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/daily-kho-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
