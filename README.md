# Vật lí 12 hiểu bản chất (bản có tài khoản)

Web ôn thi Vật lí 12 cho học sinh: 20 bài học có hình động, luyện tập, kiểm tra chương và thi thử theo cấu trúc đề tốt nghiệp. Học sinh tự đăng ký bằng email. Mọi câu trả lời được lưu vào tài khoản, để các em xem lại lịch sử, biết câu nào còn sai và làm lại cho đến khi đúng.

## Tính năng

- **Tài khoản:** đăng ký bằng email và mật khẩu, đăng nhập, đăng xuất, đổi mật khẩu.
- **Bài học, luyện tập, kiểm tra chương, thi thử:** mỗi câu trả lời được lưu ngay khi học sinh chọn. Bài thi thử được lưu khi nộp bài.
- **Lịch sử làm bài:** danh sách mọi lượt làm, kèm điểm, thời gian, số câu sai. Bấm vào một lượt để xem lại từng câu: em đã chọn gì, đáp án đúng và lời giải.
- **Câu đang sai:** những câu mà lần gần nhất em trả lời còn sai, xếp theo bài. Nút "Làm lại" đưa ra tối đa 30 câu sai nhiều nhất. Làm đúng thì câu đó tự rời khỏi danh sách.
- **Tiến bộ của em:** số lượt làm, số câu đã làm, số câu đang sai, tỉ lệ đúng theo từng bài, và 3 bài nên ôn lại trước.

## Cấu trúc thư mục

```
server/      máy chủ Node.js (không dùng thư viện ngoài), SQLite có sẵn trong Node
public/      giao diện (một file index.html, được tạo từ build/)
build/       source.html (bản offline) + online.js/online.css → build.py tạo public/index.html
test/        kiểm thử API (node --test)
data/        cơ sở dữ liệu khi chạy trên máy (không đưa lên git)
```

## Triển khai lên VPS (Ubuntu) bằng Docker Compose

**Cần có:** một VPS Ubuntu 22.04 hoặc 24.04 (1 GB RAM là đủ), và một tên miền hoặc tên miền con (ví dụ `vatly.truong.vn`).

1. **Trỏ tên miền:** trong trang quản lí DNS, tạo bản ghi `A` cho tên miền, trỏ về địa chỉ IP của VPS. Đợi vài phút cho DNS cập nhật.

2. **Cài Docker** (chỉ làm một lần):
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER   # đăng xuất rồi đăng nhập lại SSH
   ```

3. **Mở cổng 80 và 443** (nếu VPS dùng ufw):
   ```bash
   sudo ufw allow 80,443/tcp
   ```

4. **Chép mã nguồn lên VPS**, ví dụ bằng `scp -r vatly12-web user@IP:~/` hoặc `git clone`.

5. **Cấu hình và chạy:**
   ```bash
   cd ~/vatly12-web
   cp .env.example .env
   nano .env            # sửa DOMAIN=tên miền của anh
   docker compose up -d --build
   ```
   Caddy tự xin chứng chỉ HTTPS miễn phí. Sau khoảng 1 phút, mở `https://tên-miền` là thấy trang đăng nhập.

6. **Kiểm tra:** `docker compose ps` (cả hai dịch vụ ở trạng thái running/healthy) và `docker compose logs -f app`.

**Chưa có tên miền?** Có thể chạy thử bằng IP (không có HTTPS, chỉ nên dùng để thử):
```bash
docker compose -f docker-compose.ip.yml up -d --build
```
rồi mở `http://IP-của-VPS`.

## Quản trị

Các lệnh chạy trên VPS, trong thư mục `vatly12-web`:

| Việc | Lệnh |
|---|---|
| Xem danh sách tài khoản | `docker compose exec app node server/admin.js list-users` |
| Đặt lại mật khẩu khi học sinh quên | `docker compose exec app node server/admin.js reset-password email@hs.vn` |
| Xoá tài khoản (cùng lịch sử) | `docker compose exec app node server/admin.js delete-user email@hs.vn` |
| Sao lưu cơ sở dữ liệu | `docker compose exec app node server/admin.js backup` |

Lệnh `reset-password` in ra một mật khẩu tạm thời; gửi cho học sinh và nhắc các em đổi mật khẩu trong menu tài khoản. Web chưa có chức năng gửi email.

**Sao lưu ra máy:** sau lệnh `backup`, chép file về:
```bash
docker compose cp app:/app/data/backup-YYYYMMDDTHHMM.db ./
```
Nên đặt lịch sao lưu hằng tuần bằng cron.

**Khôi phục:** dừng app (`docker compose stop app`), chép file sao lưu đè lên `/app/data/vatly12.db` bằng `docker compose cp`, rồi `docker compose start app`.

**Cập nhật phiên bản mới:** chép mã mới lên rồi chạy `docker compose up -d --build`. Dữ liệu nằm trong volume `app-data` nên không bị mất.

## Chạy trên máy để phát triển

Cần Node.js 22.13 trở lên (khuyến nghị Node 24).

```bash
npm start        # mở http://localhost:3000
npm test         # chạy kiểm thử API
python build/build.py   # tạo lại public/index.html sau khi sửa build/source.html hoặc build/online.*
```

Khi thêm hoặc sửa câu hỏi: sửa trong `build/source.html` (cùng nội dung với bản offline), rồi chạy `build.py`.

## Bảo mật và giới hạn

- Mật khẩu được băm bằng scrypt. Phiên đăng nhập là cookie HttpOnly, SameSite=Lax, Secure khi chạy HTTPS, hết hạn sau 30 ngày. Máy chủ chỉ lưu mã băm SHA-256 của phiên.
- Có giới hạn số lần thử: đăng nhập và đăng ký tối đa 20 lần mỗi 15 phút cho mỗi IP; đăng nhập sai tối đa 10 lần mỗi 15 phút cho mỗi email.
- Yêu cầu ghi dữ liệu từ trang web khác bị chặn (kiểm tra Origin). Có các header bảo mật (CSP, X-Frame-Options...).
- Mỗi học sinh chỉ xem được lịch sử của chính mình.
- **Giới hạn:**
  - Chưa xác minh email, nên học sinh có thể đăng ký bằng email gõ sai.
  - Điểm được chấm trên trình duyệt rồi gửi lên máy chủ. Như vậy đủ cho mục đích tự ôn tập, nhưng không dùng để chấm thi chính thức.
  - Mã câu hỏi được đánh theo thứ tự câu trong từng bài (ví dụ `c1-2.3`). Nếu chèn hoặc xoá câu ở giữa một bài, lịch sử cũ của bài đó sẽ lệch câu. Nên thêm câu mới vào cuối.
