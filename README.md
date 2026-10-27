# Sora Group - Virtual AI Enterprise Dashboard

Gồm: `index.html` (giao diện 3D), `api/command.js` (server gọi Claude), `vercel.json`.

## Cách up lên web (Vercel, miễn phí)
1. Tạo tài khoản https://vercel.com và https://console.anthropic.com (lấy API key, nạp credit).
2. Đưa thư mục này lên GitHub (hoặc dùng Vercel CLI: `npm i -g vercel`, rồi chạy `vercel` trong thư mục này).
3. Trên Vercel > Project > Settings > Environment Variables, thêm:
   - `ANTHROPIC_API_KEY` = key của anh (không dán vào code hay chat)
   - `APP_PASSWORD` = mật khẩu anh tự đặt (để người lạ không xài hết tiền API)
   - (tùy chọn) `ANTHROPIC_MODEL` nếu muốn đổi model, mặc định `claude-sonnet-5-5`
4. Deploy. Mở trang, bấm "Ra Chỉ Đạo", nhập mật khẩu và chỉ đạo.

## Chạy thử trên máy
`vercel dev` (tạo file `.env` chứa 2 biến trên). Không mở index.html trực tiếp vì cần server.

## Lưu ý
- Đề án gần nhất lưu trong trình duyệt (localStorage), đổi máy sẽ không thấy.
- Nút Duyệt hiện chưa đăng bài mạng xã hội; phần đó là bước sau.
- Nếu gặp lỗi 502 "model": kiểm tra tên model còn dùng được trong tài khoản Anthropic.
