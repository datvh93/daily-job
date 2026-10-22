# Google Drive: tự cập nhật Excel sau mỗi lần lưu

Phù hợp mô hình 3 nhân viên (role **staff**) và 1 quản lý (role **admin**). Quản lý tạo các tài khoản trong trang Thành viên. Mọi người dùng chung dữ liệu máy chủ; PIC ghi người thực hiện nghiệp vụ, nhật ký ghi tài khoản thực tế thay đổi. Ứng dụng phát hiện xung đột khi hai người sửa cùng bản ghi, không âm thầm ghi đè.

## Cách hoạt động

Mỗi tháng có một file **Daily-Kho-YYYY-MM.xlsx** trong thư mục **Daily Kho** trên tài khoản Google đã cấp quyền. File có 8 sheet: Tổng hợp, Hàng nhập, Hàng xuất, Khai nháp, Confirm truyền, Theo ngày, Theo khách, Theo PIC.

Sau khi thêm/sửa/xóa/nhập Excel, tháng liên quan được đánh dấu cần cập nhật. Tiến trình nền kiểm tra mỗi 10 giây, tạo file lần đầu và cập nhật **cùng file ID** ở các lần sau. Nhiều lần lưu gần nhau có thể gộp thành một lần tải lên. Đổi ngày sang tháng khác sẽ làm mới cả tháng cũ và mới; xóa bản ghi cuối cùng sẽ tạo báo cáo tháng trống. Excel trên Drive là bản báo cáo do ứng dụng quản lý: **chỉnh sửa trực tiếp file trên Drive sẽ bị ghi lại ở lần đồng bộ sau**, không nhập ngược vào web.

Dữ liệu được giữ trong SQLite trước khi đồng bộ. Hàng đợi và trạng thái nằm trên ổ bền vững; lỗi Google sẽ được báo và thử lại sau 60 giây. Thay đổi đến trong lúc upload vẫn được đánh dấu cần đồng bộ tiếp. Trang **Báo cáo & Google Drive** hiển thị lần đồng bộ, lỗi và link file, có nút tải lại trạng thái. Không có kết nối thì trang báo rõ chưa đồng bộ. Khi có kết nối và mạng bình thường, độ trễ thường từ 10 giây cộng thời gian tạo/upload báo cáo; không cam kết tức thời.

Ứng dụng chỉ xin scope `drive.file`, để quản lý thư mục/file do app tạo. Không tự chia sẻ file công khai. Người quản lý có thể chia sẻ thư mục Daily Kho cho đồng nghiệp bằng giao diện Google Drive nếu cần. Người nhập liệu web không cần dùng chung tài khoản Google hoặc biết khóa Google.

## Điều kiện trước khi kết nối thật

Cần URL HTTPS hoạt động của ứng dụng (ví dụ URL Render thực tế), quyền cấu hình Google Cloud và quyền nhập biến môi trường trên hosting. Không gửi client secret, refresh token, khóa mã hóa hoặc mật khẩu trong chat/Git. Chưa có các cấu hình dưới đây thì **chưa có file nào được đồng bộ thật lên Google Drive**; các kiểm thử API Google trong repository sử dụng máy chủ giả lập.

1. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo/chọn project của đơn vị và bật **Google Drive API**.
2. Cấu hình màn hình chấp thuận OAuth (Google Auth Platform). Nếu cả đội dùng Workspace cùng đơn vị, có thể chọn đối tượng Internal khi tổ chức cho phép. Nếu chọn External, cấu hình đối tượng/test users hoặc trạng thái xuất bản theo yêu cầu của Google. Refresh token của ứng dụng External ở trạng thái Testing có thể hết hạn sau 7 ngày; cần cấu hình phù hợp cho dùng lâu dài.
3. Tạo **OAuth client ID → Web application**. Thêm Authorized redirect URI chính xác: `https://TEN-MIEN-THUC-TE/api/drive/callback`. Với URL Render thì dùng đúng tên do Render đã cấp. Không điền URL ví dụ nguyên dạng.
4. Trên Render → dịch vụ → **Environment**, cấu hình:

| Biến                   | Giá trị cần nhập                                                       |
| ---------------------- | ---------------------------------------------------------------------- |
| `APP_URL`              | URL HTTPS gốc của web, không có đường dẫn phụ                          |
| `GOOGLE_CLIENT_ID`     | OAuth Client ID của project vừa tạo                                    |
| `GOOGLE_CLIENT_SECRET` | Client secret, nhập bằng trường bảo mật của hosting                    |
| `DRIVE_ENCRYPTION_KEY` | Chuỗi ngẫu nhiên ít nhất 32 ký tự; blueprint Render đã khai báo tự tạo |

Nếu dịch vụ được tạo từ blueprint cũ, thêm DRIVE_ENCRYPTION_KEY qua Environment. Có thể tạo một chuỗi ngẫu nhiên bằng công cụ tạo bí mật của hosting. Khóa này phải **giữ nguyên qua các lần deploy/restart** và được sao lưu bảo mật. Token Google được mã hóa AES-256-GCM trong SQLite bằng khóa này, không trả token về giao diện. Không dùng một placeholder của network proxy thay cho khóa mã hóa cục bộ.

5. Lưu biến và deploy/restart dịch vụ. Đăng nhập tài khoản quản lý → **Báo cáo & Google Drive → Kết nối Google Drive** → chọn tài khoản Google sở hữu file và cấp quyền. Luồng dùng OAuth state, PKCE và giới hạn thời gian; cần quay lại bằng cùng trình duyệt đang đăng nhập quản lý.
6. Đợi đồng bộ rồi chọn **Tải lại trạng thái**. Chỉ khi có trạng thái Đã đồng bộ và file mở được trên Drive mới xem là kết nối thật thành công. Thử sửa một ghi chú trong web, lưu, đợi rồi kiểm tra chính file đó đã thay đổi mà không tạo thêm bản sao. Kiểm tra cả restart với ổ bền vững.

## Nghiệp vụ đã áp dụng

| Chiều | Đầu số | Luồng hàng                                    | Bên mở tờ khai |
| ----- | ------ | --------------------------------------------- | -------------- |
| Nhập  | 3      | Nội địa → Kho                                 | Khách hàng     |
| Nhập  | 1      | Nước ngoài → Kho (C11 theo nghiệp vụ của kho) | Kho            |
| Xuất  | 1      | Kho → Nội địa                                 | Khách hàng     |
| Xuất  | 5      | Kho → Nước ngoài hoặc Kho → CFS               | Kho            |

Đầu số 5 không đủ để suy ra CFS hay nước ngoài: nhân viên chọn đích thực tế. Không suy đoán đầu số với các ô Excel chứa tên/chưa có số tờ khai; không tự thay mã loại hình do người dùng cung cấp. File cũ có trạng thái “OK” không tự chuyển thành luồng Xanh: luồng Xanh/Vàng/Đỏ là trường riêng, để trống nếu chưa biết.

Trang Khai nháp & truyền có hai danh sách độc lập để giữ đúng file Excel gốc. Với hồ sơ mới, dùng **Confirm truyền** trên đúng bản nháp để tạo bước truyền có liên kết rõ ràng, sao chép khách và BILL. Không tự ghép hồ sơ cũ chỉ vì cùng dòng hoặc cùng tên khách. Số tờ khai truyền ở phần truyền là số tờ khai; giữ chuỗi để không mất số 0 đầu.

Báo cáo tách tổng số kiện theo đơn vị, không cộng PP và CT thành một đơn vị. SL/GW ô gộp được tính một lần tại dòng đầu, có ghi chú và số lô thiếu/trống/gộp. Báo cáo PIC phản ánh trường PIC nhập trong nghiệp vụ, không thay thế nhật ký thao tác.

## Khi lỗi hoặc đổi tài khoản

- **Chưa cấu hình**: kiểm tra đủ bốn biến trên. Tải Excel báo cáo thủ công vẫn hoạt động.
- **Google từ chối / hết quyền**: kiểm tra quyền API, consent và hạn mức; kết nối lại. Dữ liệu web vẫn còn.
- **Đổi khóa mã hóa**: cần khôi phục khóa cũ hoặc ngắt kết nối rồi kết nối lại. Không xóa database để sửa lỗi OAuth.
- **Ngắt kết nối**: xóa token ở ứng dụng, dừng đồng bộ, giữ các file đã có trên Drive. Có thể thu hồi quyền app trong tài khoản Google nếu cần. Kết nối lại sẽ tìm file do app tạo theo tháng trên tài khoản được chọn; không xóa file cũ.
- **Xóa thủ công file/thư mục do app tạo**: có thể gây lỗi đồng bộ. Kết nối lại để dò lại tài khoản/file; trang báo lỗi giúp kiểm tra.

Sao lưu database **và khóa mã hóa** an toàn, tách khỏi Git. File báo cáo trên Drive không chứa tài khoản đăng nhập, phiên hoặc toàn bộ nhật ký nên không thay thế bản sao lưu hệ thống.
