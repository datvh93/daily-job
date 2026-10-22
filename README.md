# Daily Kho

Ứng dụng web tiếng Việt quản lý **kế hoạch nhập/xuất theo lô hàng** và tiến độ tờ khai C11, dựa trên bảng kế hoạch Excel. Giao diện đáp ứng cho máy tính và điện thoại. Phạm vi chỉ gồm các mục trong Excel: Hàng nhập, Hàng xuất và Tờ khai C11.

## Chạy trên máy phát triển

Yêu cầu Node.js **24 trở lên** và npm. SQLite tích hợp sẵn trong Node, không cần dịch vụ cơ sở dữ liệu riêng.

```sh
cd /workspace/daily-job
npm ci --cache /workspace/.npm-cache
npm start
```

Mặc định máy chủ nghe tại `127.0.0.1:3000`. Truy cập bằng trình duyệt trên máy chạy ứng dụng. Lần đầu hiển thị form tạo quản trị viên; **không có tài khoản/mật khẩu mặc định**. Tạo quản trị viên trước khi mở truy cập ra ngoài. Môi trường hiện đã nhập dữ liệu thực từ file T10.xlsx; chưa tạo tài khoản quản trị thay người dùng. Các kiểm thử dùng dữ liệu tạm riêng.

Các biến tùy chọn:

| Biến            | Mặc định    | Ý nghĩa                                                  |
| --------------- | ----------- | -------------------------------------------------------- |
| `PORT`          | `3000`      | Cổng HTTP                                                |
| `HOST`          | `127.0.0.1` | Chỉ đặt `0.0.0.0` khi cần truy cập qua mạng đã kiểm soát |
| `DATA_DIR`      | `./data`    | Thư mục lưu SQLite bền vững, ngoài thư mục public        |
| `COOKIE_SECURE` | tắt         | Đặt `true` khi triển khai HTTPS                          |

Ứng dụng hiện chạy trong môi trường phát triển, **chưa triển khai thành website công khai**. Đã có Dockerfile và cấu hình Render; xem [DEPLOY.md](DEPLOY.md) để kích hoạt dịch vụ HTTPS có ổ dữ liệu bền vững. Để nhiều người truy cập từ Internet, cần triển khai sau reverse proxy HTTPS với tên miền, ổ đĩa bền vững, sao lưu và cấu hình proxy giữ đúng Host/X-Forwarded-Proto. Tạo quản trị trước khi công khai. Chạy một tiến trình ứng dụng với SQLite trên ổ đĩa cục bộ; không chia sẻ SQLite qua ổ mạng.

## Nghiệp vụ kho ngoại quan và Google Drive

Ứng dụng phân loại bên mở tờ khai theo đầu số 3/1 cho nhập và 1/5 cho xuất; đích CFS/nước ngoài được chọn rõ ràng. Có luồng tờ khai Xanh/Vàng/Đỏ, tạo Confirm truyền từ bản nháp đã chọn, báo cáo tháng 8 sheet và hàng đợi tự cập nhật một file Excel mỗi tháng trên Google Drive.

Xem [GOOGLE-DRIVE.md](GOOGLE-DRIVE.md) để cấu hình OAuth và kết nối tài khoản thật. Chưa kết nối Google thì chỉ lưu web và tải Excel thủ công; không được coi là đã đồng bộ Drive. Khuyến nghị 3 tài khoản staff và 1 admin quản lý.

## Chức năng

- Lọc ngày (mặc định hôm nay theo giờ Việt Nam), nhập/xuất, trạng thái; tìm khách, chứng từ, PIC và các trường lô hàng.
- Tạo, xem, sửa, xóa lô; số tờ khai, loại hình, INV, BILL, ngày tờ khai, số kiện, đơn vị, trọng lượng kg, cảng hạ, CFS và ghi chú.
- Theo dõi C11: khách nhập, BILL, giờ nhận, trạng thái, PIC, draft, truyền, BILL truyền, confirm, số thông quan, giờ và trạng thái truyền.
- Số liệu tổng hợp theo bộ lọc. Checkbox TRUE trong Excel được ánh xạ thành Hoàn tất; FALSE hoặc ô trạng thái trống thành Chờ xử lý.
- Admin: toàn quyền, tạo thành viên, đổi quyền, khóa tài khoản, đặt lại mật khẩu, xem lịch sử 200 thao tác gần nhất. Staff: xem/thêm/sửa/nhập Excel, không xóa. Viewer: chỉ xem và xuất Excel.
- Mật khẩu băm scrypt có salt; session cookie HttpOnly, thời hạn 12 giờ; giới hạn đăng nhập sai; kiểm tra quyền tại máy chủ. Thay đổi quyền/mật khẩu thu hồi phiên đăng nhập. Không được hạ quyền quản trị viên cuối cùng.
- Sửa dữ liệu có version để phát hiện thao tác đồng thời; nhấn Tải lại khi có xung đột. Dữ liệu không tự đồng bộ thời gian thực trên giao diện.
- Nhật ký giữ dữ liệu trước sửa/xóa, không có chức năng khôi phục tự động.

## Excel

Ứng dụng nhận hai bố cục `.xlsx` (tối đa 5 MB/1.000 bản ghi):

1. **File gốc như T10.xlsx:** hàng tiêu đề gồm Hàng Nhập ở B1:M1, Hàng Xuất ở N1:AA1 và Tờ khai C11 ở AB1:AM1; ngày XN ở cột A, tiêu đề chi tiết ở dòng 2. Các sheet được nhận diện đúng bố cục đều được đọc; có cảnh báo nếu bỏ qua sheet khác.
2. **Mẫu phẳng của ứng dụng:** tải mẫu, xóa dòng minh họa, điền từng bản ghi và giữ nguyên tiêu đề cột. Chỉ đọc sheet đầu tiên. Ngày `YYYY-MM-DD`, giờ `HH:mm`, loại `Nhập`/`Xuất`/`C11`; C11 có công đoạn `Khai nháp` hoặc `Truyền`. Trạng thái `Chờ xử lý`/`Đang xử lý`/`Hoàn tất`.

Chọn tệp → xem thống kê, cảnh báo và bản xem trước 20 dòng đầu → xác nhận. Nếu có lỗi phải sửa trước; toàn bộ dữ liệu được ghi trong một transaction. Công thức cần chuyển thành giá trị. Số kiện/SL phiếu nguyên không âm, GW không âm; ô trống giữ trống, không tự điền 0. Mã chứng từ lưu dạng văn bản (giữ số 0 đầu nếu Excel còn chứa định dạng hoặc chuỗi gốc).

### Quy tắc ánh xạ T10

- Ngày lấy từ cột A, kể cả ngày gộp cho nhiều dòng. Hàng nhập và hàng xuất cùng dòng được lưu thành hai bản ghi độc lập. Thêm đầy đủ **SL phiếu**, **Số tờ khai CSHT**, cảng hạ và ghi chú.
- C11 gồm **hai danh sách độc lập**: AB:AG là khai nháp, AH:AM là truyền. Không ghép với nhau hoặc với hàng nhập/xuất chỉ vì cùng dòng. Giữ nguyên khách, BILL, giờ nhận chứng từ, trạng thái, PIC, giờ draft, confirm, thông quan và giờ truyền. Form C11 cho tạo/sửa từng công đoạn riêng.
- Chỉ checkbox không tạo bản ghi rỗng. Dòng có thông tin nhưng thiếu khách/ngày được báo lỗi, không bỏ âm thầm.
- SL kiện/GW gộp nhiều dòng chỉ được ghi tại dòng đầu; các dòng sau giữ ô trống và thông tin tham chiếu vùng gộp. Không nhân số hoặc chia đều. Tổng theo bộ lọc chỉ tính số tại dòng đầu, không suy ra số cho từng tờ khai. Khi lọc mất dòng đầu nhóm, số chung không được phân bổ sang các dòng còn lại. Sửa số chung tại bản ghi dòng đầu, không điền lại số vào các dòng phụ.
- Mỗi bản ghi có nguồn sheet/vùng dòng và mã chống trùng. Nhập lại cùng nội dung tại cùng vị trí nguồn sẽ bỏ qua, kể cả khi bản ghi trong ứng dụng đã được sửa. **File đã thay đổi nội dung hoặc vị trí dòng có thể tạo bản ghi mới**; không tự ghi đè bản ghi đã có. Mẫu phẳng không có mã chống trùng sẽ tạo mới.

Xuất Excel hiện dùng mẫu phẳng, gồm **tất cả mục nhập/xuất/C11 của ngày đã chọn**, không áp dụng bộ lọc tìm kiếm/loại/trạng thái. Xóa ngày lọc để xuất tất cả ngày. Giữ các cột nguồn/mã chống trùng nếu muốn xuất rồi nhập lại mà không nhân bản. File xuất không tái tạo định dạng màu/ô gộp của Excel gốc.

### Nhập lần đầu bằng CLI (người vận hành máy chủ)

```sh
node scripts/import-excel.js /path/to/T10.xlsx          # chỉ kiểm tra
node scripts/import-excel.js /path/to/T10.xlsx --apply  # nhập dữ liệu
```

Khởi động ứng dụng một lần để tạo schema trước khi dùng CLI. CLI không tạo tài khoản, dùng cùng validation và transaction với API, giữ bản gốc tại thư mục `data/imports/` (tên theo SHA-256). Không cung cấp CLI này qua HTTP. Bản dữ liệu đã nhập trong môi trường hiện tại: 108 hàng nhập, 105 hàng xuất, 38 khai nháp, 47 truyền; tổng 298 bản ghi, ngày 01–21/10/2026.

## Kiểm thử

```sh
npm test
npm run test:e2e
```

`npm test` kiểm tra bố cục T10 bằng workbook tổng hợp (không đưa file khách hàng vào Git), gồm ô gộp, ngày/giờ, số 0 đầu, checkbox thừa, C11 tách độc lập và nhập lại không trùng. Các kiểm thử API dùng cơ sở dữ liệu tạm: đăng nhập, quyền, validation, CRUD, chống ghi đè, đọc/ghi Excel, import nguyên tử, lưu dữ liệu sau khởi động lại, nhật ký và thu hồi phiên.

Kiểm thử trình duyệt dùng Chromium tại `/usr/bin/chromium`; có thể đặt `CHROMIUM_PATH` tới trình duyệt khác. Test chạy máy chủ riêng ở cổng 3199, dữ liệu trong thư mục tạm. Nếu chưa có Chromium, cài trình duyệt Playwright rồi cấu hình đường dẫn thích hợp. Các kiểm thử không ghi dữ liệu vào môi trường sử dụng thật.

## Sao lưu

Dữ liệu trong `data/warehouse.sqlite` cùng các tệp WAL/SHM khi máy chủ chạy. Để sao lưu đơn giản và nhất quán, dừng ứng dụng rồi sao chép toàn bộ thư mục `data/` vào nơi an toàn; khởi động lại sau khi sao lưu. Không commit dữ liệu hay thông tin đăng nhập. File Excel xuất ra **không thay thế sao lưu toàn bộ** (không gồm tài khoản, session, nhật ký).

Snapshot môi trường cloud không phải dịch vụ hosting hay chiến lược sao lưu sản xuất. Mã nguồn và dữ liệu công việc được tách riêng: không đưa file Excel, SQLite hoặc tài khoản vào Git.
