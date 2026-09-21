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

// ---------- Migration: bổ sung cột cho form đăng ký đầy đủ ----------
// Form thật trên website hỏi nhiều hơn 3 ô cơ bản: khách quan tâm hạng mục nào,
// làm ở công ty nào, phòng xuất nhập khẩu bao nhiêu người, và đang vướng ở đâu.
// Bốn thông tin đó là thứ quyết định nên báo giá gói nào và nói chuyện thế nào,
// nên phải lưu vào CRM chứ không được vứt đi.
//
// Dùng ALTER TABLE thay vì sửa thẳng CREATE TABLE ở trên, để database đã có sẵn
// dữ liệu cũ vẫn nâng cấp được mà không mất khách nào. Chạy lại nhiều lần vô hại:
// cột nào đã có thì bỏ qua.
const COT_KHACH_HANG_MOI = [
  ["hang_muc", "TEXT"], // hạng mục khách quan tâm (1 trong 6 lựa chọn trên form)
  ["cong_ty", "TEXT"], // tên công ty
  ["quy_mo", "TEXT"], // quy mô phòng xuất nhập khẩu
  ["diem_nghen", "TEXT"], // điểm nghẽn lớn nhất khách đang gặp
  ["nguon", "TEXT"], // đến từ đâu: 'website' hay 'trang-dang-ky'
];

const cotDangCo = new Set(
  db.prepare("PRAGMA table_info(customers)").all().map((c) => c.name)
);

let soCotDaThem = 0;
for (const [ten, kieu] of COT_KHACH_HANG_MOI) {
  if (!cotDangCo.has(ten)) {
    db.exec(`ALTER TABLE customers ADD COLUMN ${ten} ${kieu}`);
    soCotDaThem++;
  }
}
if (soCotDaThem > 0) {
  console.log(`[db] Đã bổ sung ${soCotDaThem} cột mới vào bảng customers.`);
}

// ---------- Seed catalogue sản phẩm thật ----------
// QUAN TRỌNG: gói Render miễn phí KHÔNG có ổ đĩa lưu trữ. Mỗi lần service ngủ
// (sau ~15 phút không có request) rồi thức dậy, hoặc mỗi lần deploy lại, toàn bộ
// thư mục ứng dụng — bao gồm file brain.db này — bị tạo mới từ đầu. Nghĩa là mọi
// sản phẩm thêm tay qua /admin sẽ biến mất sau đó.
//
// Vì vậy toàn bộ catalogue thật phải nằm ngay trong seed này, để sau mỗi lần khởi
// động lại sản phẩm tự có đủ, không phải nhập tay lại. Seed theo từng sản phẩm
// (kiểm tra theo tên) thay vì chỉ chạy khi bảng rỗng — như vậy sau này nếu có gắn
// ổ đĩa thật hoặc chuyển sang Postgres, thêm sản phẩm mới vào danh sách dưới đây
// vẫn seed được mà không tạo bản trùng.
//
// Dữ liệu KHÁCH HÀNG và ĐƠN HÀNG thì không seed được — muốn giữ được chúng phải
// nâng cấp Render lên gói có Persistent Disk, hoặc chuyển database sang Postgres.

const CATALOGUE = [
  {
    name: "Khóa học: Các cách tìm khách xuất khẩu",
    type: "digital",
    price: 1490000,
    description:
      "Toàn bộ kênh tìm buyer đang thực sự ra đơn — kèm cách dùng AI rút ngắn từng bước. Bản đồ 9 kênh tìm buyer: hội chợ, B2B, LinkedIn, dữ liệu hải quan. Quy trình thẩm định buyer trước khi báo giá. Cold email & follow-up theo phễu 7 chạm. Đàm phán giá, Incoterms và điều khoản thanh toán.",
    stock: null,
  },
  {
    name: "Bộ công cụ AI cho 5 nhân viên",
    type: "digital",
    price: 3000000,
    description:
      "Thư viện prompt và trợ lý AI dựng riêng cho từng vị trí trong phòng xuất nhập khẩu (Sales, Chứng từ, Purchasing, Quản lý). Cấp 5 tài khoản, lộ trình triển khai 7 ngày. Giá gốc 5.000.000đ, đang giảm 40% còn 3.000.000đ.",
    stock: null,
  },
  {
    name: "Chatbot AI trực khách 24/7",
    type: "service",
    price: 26300000,
    description:
      "Trợ lý trả lời buyer quốc tế lệch múi giờ, đọc đúng catalogue và giá của bạn. Huấn luyện trên catalogue, MOQ, chính sách giá thật của bạn. Đa ngôn ngữ: Anh, Trung, Nhật, Hàn, Tây Ban Nha. Gắn website, Messenger, WhatsApp, Zalo OA. Chấm điểm và chuyển lead nóng về sales kèm bản ghi. (Giá gốc 1.000 USD/triển khai — số tiền VNĐ là quy đổi tạm theo tỷ giá ~26.255đ/USD ngày 05/09/2026, khách tự đối chiếu tỷ giá ngân hàng lúc thanh toán và điều chỉnh nếu cần.)",
    stock: null,
  },
];

const findByName = db.prepare("SELECT id FROM products WHERE name = ?");
const insertProduct = db.prepare(
  `INSERT INTO products (name, type, price, description, stock) VALUES (?, ?, ?, ?, ?)`
);

let seeded = 0;
for (const p of CATALOGUE) {
  if (!findByName.get(p.name)) {
    insertProduct.run(p.name, p.type, p.price, p.description, p.stock);
    seeded++;
  }
}
if (seeded > 0) {
  console.log(`[db] Đã seed ${seeded} sản phẩm thật lấy từ crewinthetown.com.`);
}


// ---------- Khôi phục bản ghi khách hàng và đơn hàng của lần test thật ----------
// Đây là dữ liệu THẬT đã xảy ra ngày 05/09/2026: một đơn 2.000đ được chuyển khoản thật,
// Sepay gọi webhook về và hệ thống tự khớp, mã giao dịch 79389218.
//
// Vì Render gói miễn phí xoá sạch database mỗi lần service ngủ dậy, bản ghi này biến mất
// sau mỗi lần đó. Khối dưới đây khôi phục lại nó để trang /admin luôn có dữ liệu ở cả 3 tab.
//
// CHỈ chạy khi bảng orders đang rỗng — nên nếu sau này xoá tay đơn này, hoặc đã có đơn
// thật của khách, thì khối này không đụng vào gì nữa.
//
// Khi nào chuyển sang Postgres hoặc VPS (dữ liệu không còn bị mất) thì xoá cả khối này đi.

const orderCount = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
if (orderCount === 0) {
  const TEST_PRODUCT = "[TEST] Gói kiểm tra thanh toán 2.000đ";

  let tp = db.prepare("SELECT id FROM products WHERE name = ?").get(TEST_PRODUCT);
  if (!tp) {
    const r = db
      .prepare("INSERT INTO products (name, type, price, description, stock) VALUES (?, ?, ?, ?, ?)")
      .run(
        TEST_PRODUCT,
        "digital",
        2000,
        "Gói dùng để chạy thử luồng thanh toán Sepay thật theo SOP Ngày 10. Không bán cho khách — đã ẩn khỏi trang thanh toán công khai.",
        null
      );
    tp = { id: r.lastInsertRowid };
  }

  let cus = db.prepare("SELECT id FROM customers WHERE phone = ?").get("0869395647");
  if (!cus) {
    const r = db
      .prepare("INSERT INTO customers (name, phone, email, zalo, registered_at) VALUES (?, ?, ?, ?, ?)")
      .run("Tina Lê", "0869395647", "hello.globalexport5@gmail.com", null, "2026-09-05 13:48:53");
    cus = { id: r.lastInsertRowid };
  }

  db.prepare(
    `INSERT INTO orders (order_code, customer_id, product_id, amount, status, sepay_transaction_id, created_at, paid_at)
     VALUES (?, ?, ?, ?, 'success', ?, ?, ?)`
  ).run("DH000001", cus.id, tp.id, 2000, "79389218", "2026-09-05 13:48:53", "2026-09-05 13:50:08");

  console.log("[db] Đã khôi phục bản ghi đơn test thật DH000001 (2.000đ, Sepay 79389218).");
}

module.exports = db;
