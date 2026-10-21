# Đưa Daily Kho lên Render

Cấu hình đã chuẩn bị tại `render.yaml` và `Dockerfile`. Render cấp URL HTTPS sau khi tạo Web Service thành công; chưa có URL nào được tạo ở bước chuẩn bị này.

## Chi phí và dữ liệu

Cấu hình dùng **Web Service Starter và persistent disk 1 GB, có trả phí**. Kiểm tra số tiền Render hiển thị trước khi xác nhận. Không dùng filesystem tạm của gói miễn phí để lưu SQLite. Chạy một instance, không nhân bản ứng dụng dùng chung SQLite.

Mã nguồn trên GitHub không chứa tài khoản, database hoặc file T10.xlsx của bạn. Dữ liệu đã nhập trong môi trường phát triển không tự chuyển sang Render. Sau khi tạo quản trị viên trên Render, nhập lại T10.xlsx qua giao diện; ứng dụng sẽ đọc 298 mục từ bản file đã cung cấp.

## Các bước trong Render

1. Tạo tài khoản và đăng nhập tại https://dashboard.render.com/, kết nối tài khoản GitHub có quyền truy cập repository `datvh93/daily-job`.
2. Chọn **New → Blueprint**, chọn repository, nhánh `main`. Render đọc `render.yaml` tại thư mục gốc.
3. Kiểm tra cấu hình và **chi phí**, rồi xác nhận tạo dịch vụ. Đợi bản build/deploy chuyển sang hoạt động.
4. Trong trang dịch vụ → **Environment**, xem giá trị bí mật `SETUP_TOKEN` do Render tạo. Không gửi khóa này trong chat hoặc đưa vào Git.
5. Mở **URL HTTPS do Render hiển thị**, nhập khóa khởi tạo, họ tên, tên đăng nhập và mật khẩu của bạn để tạo quản trị viên đầu tiên. Người khác không có khóa không thể chiếm bước khởi tạo. Không có tài khoản mặc định.
6. Đăng nhập, nhập `T10.xlsx` và kiểm tra thống kê: 108 nhập, 105 xuất, 38 khai nháp, 47 truyền C11. Tạo tài khoản cho các thành viên và cấp quyền tương ứng.
7. Khởi động lại dịch vụ từ Render, đăng nhập lại và xác nhận các bản ghi vẫn còn. Đây là bước xác nhận ổ lưu bền vững trên môi trường hosting thực tế.

`/healthz` là endpoint kiểm tra máy chủ và kết nối SQLite. `/api/shipments` không có phiên đăng nhập phải trả HTTP 401. Khi sử dụng domain riêng, cấu hình theo hướng dẫn của Render và giữ HTTPS.

Tự triển khai từ Git đang tắt (`autoDeployTrigger: off`): thay đổi mã nguồn sẽ không tự tác động dịch vụ đang chạy. Chủ động deploy bản mới sau khi kiểm thử.

## Sao lưu

Thiết lập lịch sao lưu riêng trước khi dùng dữ liệu công việc chính thức. Cơ sở dữ liệu trên Render nằm ở `/app/data/warehouse.sqlite`. Không sao chép riêng tệp SQLite đang ghi mà bỏ WAL. Có thể dùng API backup của Node SQLite để tạo bản sao nhất quán, rồi chuyển ra nơi lưu trữ an toàn:

```sh
node -e 'const {DatabaseSync,backup}=require("node:sqlite"); const db=new DatabaseSync("/app/data/warehouse.sqlite"); backup(db,"/app/data/warehouse-backup.sqlite").then(()=>db.close()).catch(e=>{console.error(e.message);process.exitCode=1})'
```

Bản sao trên cùng ổ đĩa chưa bảo vệ khỏi mất ổ; cần chuyển ra nơi khác. Excel xuất ra không chứa tài khoản và nhật ký, nên không thay thế sao lưu toàn bộ.
