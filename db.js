// db.js — Khởi tạo và quản lý brain.db (SQLite)
// Chứa 3 bảng: products, customers, orders

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "brain.db");
const db = new Database(DB_PATH);
// Lưu ý: KHÔNG dùng journal_mode = WAL hay DELETE ở đây khi chạy trên thư mục
// đồng bộ/mount ảo (qua Claude desktop, iCloud...) — các chế độ này cần tạo/xoá
// file journal phụ, mà mount ảo không hỗ trợ thao tác xoá file, gây lỗi
// "disk I/O error". journal_mode = MEMORY giữ nhật ký giao dịch trong RAM,
// tránh hẳn việc tạo/xoá file phụ. Khi deploy lên server thật (Render...),
// ổ đĩa bình thường nên vẫn an toàn cho việc này.
db.pragma("journal_mode = MEMORY");

// ---------- Tạo bảng ----------
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('physical','digital','service')),
  price INTEGER NOT NULL,
  description TEXT,
  stock INTEGER, -- chỉ bắt buộc với physical, digital/service để NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  zalo TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE, -- vd DH000123, dùng làm nội dung chuyển khoản
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','cancelled')),
  sepay_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
`);

// Ràng buộc mềm: physical bắt buộc có stock, digital/service để NULL — validate ở tầng ứng dụng (routes)

// ---------- Seed sản phẩm mặc định nếu bảng đang trống ----------
const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
if (productCount === 0) {
  db.prepare(
    `INSERT INTO products (name, type, price, description, stock) VALUES (?, ?, ?, ?, ?)`
  ).run(
    "Bộ công cụ AI cho 5 nhân viên",
    "digital",
    3000000,
    "Thư viện prompt và trợ lý AI dựng riêng cho từng vị trí trong phòng xuất nhập khẩu (Sales, Chứng từ, Purchasing, Quản lý). Cấp 5 tài khoản, lộ trình triển khai 7 ngày. Giá gốc 5.000.000đ, đang giảm 40% còn 3.000.000đ.",
    null
  );
  console.log("[db] Đã seed sản phẩm thật lấy từ crewinthetown.com.");
}

module.exports = db;
