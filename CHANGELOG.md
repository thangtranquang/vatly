# Changelog

All notable changes to this project, newest first. Entries are grouped by UTC date.

## 2026-10-21

### Web Vật lí 12 có tài khoản và lịch sử làm bài — 07:24 UTC
**Summary:** Học sinh đăng ký bằng email, làm bài trực tuyến và xem lại mọi câu đã sai để cải thiện.
**Details:** Bản web chạy trên VPS bằng Docker Compose (HTTPS tự động qua Caddy). Gồm đăng ký, đăng nhập, đổi mật khẩu; lưu từng câu trả lời của bài học, luyện tập, kiểm tra chương và thi thử; trang lịch sử, xem lại từng lượt, danh sách câu đang sai kèm nút làm lại, trang tiến bộ theo từng bài. Có lệnh quản trị để đặt lại mật khẩu và sao lưu dữ liệu.
**Technical details:** Adds a small Node.js service with a SQLite database storing accounts, sessions and per-question answers, behind a Caddy reverse proxy that provides HTTPS. New student-only screens for sign-in, history, wrong answers and progress on top of the existing study site. Introduces a database and a two-container deployment on a VPS; scores are graded in the browser and stored per account.
