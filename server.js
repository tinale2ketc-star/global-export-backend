// server.js — Website + Sepay payment + CRM + Admin panel
require("dotenv").config();
const path = require("path");
const express = require("express");
const db = require("./db");
const { isValidPhone, isValidEmail, makeOrderCode, buildQrUrl } = require("./utils");
const { guiChuoiChaoMung, guiXacNhanDon, laEmailTest } = require("./mailer");

const app = express();
app.use(express.json());
// ==================================================
// Bảo vệ khu vực admin bằng mật khẩu (HTTP Basic Auth)
// ==================================================
// Trong khu vực admin có tên, số điện thoại, email của khách hàng thật và nút xoá
// dữ liệu, nên không được để mở cho bất kỳ ai có đường link.
//
// Mật khẩu đặt bằng biến môi trường trên Render (Environment):
//   ADMIN_PASSWORD  — bắt buộc
//   ADMIN_USER      — không bắt buộc, mặc định là "admin"
//
// Nếu chưa đặt ADMIN_PASSWORD thì khu vực admin bị KHOÁ HẲN chứ không mở tự do —
// thà không vào được còn hơn để lộ dữ liệu khách.
//
// Lưu ý: middleware này phải nằm TRƯỚC express.static, vì express.static phục vụ
// thẳng thư mục public/ nên nếu đặt sau thì vẫn vào được admin qua /admin.html.

const crypto = require("crypto");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// So sánh chuỗi theo thời gian cố định, tránh dò mật khẩu qua thời gian phản hồi
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // vẫn tốn thời gian tương đương
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function isAdminPath(reqPath) {
  const s = (reqPath.replace(/\/+$/, "") || "/").toLowerCase();
  return s === "/admin" || s === "/admin.html" || s.startsWith("/api/admin");
}

function requireAdminAuth(req, res, next) {
  if (!isAdminPath(req.path)) return next();

  if (!ADMIN_PASSWORD) {
    return res
      .status(503)
      .type("text/plain; charset=utf-8")
      .send(
        "Khu vuc admin dang bi khoa vi chua dat mat khau.\n\n" +
          "Cach mo khoa: vao Render > service global-export-backend > tab Environment,\n" +
          "them bien ADMIN_PASSWORD voi mat khau ban chon, bam Save."
      );
  }

  const header = req.headers["authorization"] || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch (e) {
      decoded = "";
    }
    const i = decoded.indexOf(":");
    const user = i === -1 ? decoded : decoded.slice(0, i);
    const pass = i === -1 ? "" : decoded.slice(i + 1);
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Global Export 5.0 Admin", charset="UTF-8"');
  return res
    .status(401)
    .type("text/plain; charset=utf-8")
    .send("Can dang nhap de vao khu vuc admin.");
}

app.use(requireAdminAuth);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ==================================================
// Helpers
// ==================================================
function upsertCustomer({ name, phone, email, zalo }) {
  let existing = null;
  if (phone) existing = db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
  if (!existing && email) existing = db.prepare("SELECT * FROM customers WHERE email = ?").get(email);

  if (existing) {
    db.prepare(
      "UPDATE customers SET name = ?, phone = COALESCE(?, phone), email = COALESCE(?, email), zalo = COALESCE(?, zalo) WHERE id = ?"
    ).run(name, phone || null, email || null, zalo || null, existing.id);
    return existing.id;
  }
  const info = db
    .prepare("INSERT INTO customers (name, phone, email, zalo) VALUES (?, ?, ?, ?)")
    .run(name, phone || null, email || null, zalo || null);
  return info.lastInsertRowid;
}

// ==================================================
// Public: form đăng ký trên landing page (waitlist)
// ==================================================
app.post("/api/signup", (req, res) => {
  const { name, phone, email } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập họ tên." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng số VN." });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: "Email không hợp lệ." });
  }
  const customerId = upsertCustomer({ name: name.trim(), phone, email });

  // Trả lời khách ngay, không bắt họ ngồi chờ Resend. Nếu Resend chậm hoặc lỗi thì
  // đăng ký vẫn thành công và lỗi được ghi vào log — không để hỏng cả form vì email.
  res.json({ success: true, customerId, cheDoTest: laEmailTest(email) });

  guiChuoiChaoMung({ ten: name.trim(), email }).catch((err) =>
    console.error("[mail] Lỗi chuỗi chào mừng:", err.message)
  );
});

// ==================================================
// Public: danh sách sản phẩm cho trang thanh toán
// ==================================================
app.get("/api/products", (req, res) => {
  // Ẩn các gói tên bắt đầu bằng "[TEST]" khỏi trang thanh toán công khai — chúng chỉ dùng
  // để chạy thử luồng thanh toán và vẫn hiện đầy đủ trong trang /admin.
  const products = db
    .prepare("SELECT id, name, type, price, description, stock FROM products WHERE name NOT LIKE '[TEST]%' ORDER BY id ASC")
    .all();
  res.json(products);
});

// ==================================================
// Public: tạo đơn hàng (checkout) -> trạng thái pending + trả về QR
// ==================================================
app.post("/api/orders", (req, res) => {
  const { name, phone, email, product_id } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập họ tên." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng số VN." });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Email không hợp lệ." });
  }
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
  if (!product) {
    return res.status(400).json({ error: "Sản phẩm không tồn tại." });
  }
  if (product.type === "physical" && (product.stock === null || product.stock <= 0)) {
    return res.status(400).json({ error: "Sản phẩm đã hết hàng." });
  }

  const customerId = upsertCustomer({ name: name.trim(), phone, email });

  const insert = db
    .prepare(
      "INSERT INTO orders (order_code, customer_id, product_id, amount, status) VALUES (?, ?, ?, ?, 'pending')"
    )
    .run("TEMP", customerId, product.id, product.price);
  const orderId = insert.lastInsertRowid;
  const orderCode = makeOrderCode(orderId);
  db.prepare("UPDATE orders SET order_code = ? WHERE id = ?").run(orderCode, orderId);

  const qrUrl = buildQrUrl({ amount: product.price, orderCode });

  res.json({
    orderId,
    orderCode,
    amount: product.price,
    status: "pending",
    qrUrl,
    vaAccount: process.env.SEPAY_VA_ACCOUNT,
    bank: process.env.SEPAY_BANK || "BIDV",
  });
});

// Kiểm tra trạng thái đơn hàng (trang checkout poll liên tục)
app.get("/api/orders/:id/status", (req, res) => {
  const order = db.prepare("SELECT id, status, order_code FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  res.json(order);
});

// ==================================================
// Sepay Webhook — Sepay gọi tới đây khi có giao dịch báo có
// ==================================================
function markOrderPaid(order, sepayTransactionId) {
  if (order.status === "success") return; // đã xử lý rồi, tránh trừ kho 2 lần
  db.prepare("UPDATE orders SET status = 'success', paid_at = datetime('now'), sepay_transaction_id = ? WHERE id = ?").run(
    String(sepayTransactionId || ""),
    order.id
  );
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(order.product_id);
  if (product && product.type === "physical" && product.stock !== null) {
    db.prepare("UPDATE products SET stock = MAX(stock - 1, 0) WHERE id = ?").run(product.id);
  }

  // Email xác nhận đơn hàng — gửi ngay khi đơn chuyển sang "Thành công", bất kể do
  // webhook Sepay tự khớp hay do admin bấm xác nhận tay.
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(order.customer_id);
  if (customer && customer.email) {
    guiXacNhanDon({
      ten: customer.name,
      email: customer.email,
      maDon: order.order_code,
      tenSanPham: product ? product.name : "Hạng mục đã đặt",
      soTien: order.amount,
      thoiGian: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    }).catch((err) => console.error("[mail] Lỗi email xác nhận đơn:", err.message));
  }
}

app.post("/api/sepay-webhook", (req, res) => {
  // Xác thực bằng API Key riêng cho webhook (đặt khi tạo webhook trong my.sepay.vn)
  const auth = req.headers["authorization"] || "";
  const expected = `Apikey ${process.env.SEPAY_WEBHOOK_KEY || ""}`;
  if (!process.env.SEPAY_WEBHOOK_KEY || auth !== expected) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const body = req.body || {};
  const content = String(body.content || body.description || "");
  const amount = Number(body.transferAmount || 0);
  const transferType = body.transferType;
  const sepayTransactionId = body.id;

  if (transferType !== "in") {
    return res.json({ success: true }); // bỏ qua giao dịch tiền ra
  }

  const match = content.match(/DH\d{6,}/i);
  if (match) {
    const orderCode = match[0].toUpperCase();
    const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode);
    if (order && order.amount === amount) {
      markOrderPaid(order, sepayTransactionId);
      return res.json({ success: true });
    }
  }

  // Không khớp được đơn hàng nào tự động — cần xử lý tay ở /admin (theo lưu ý của SOP)
  console.warn("[sepay-webhook] Không khớp được đơn hàng:", { content, amount });
  res.json({ success: true });
});

// ==================================================
// Admin API — CRUD cho 3 bảng (đã được bảo vệ bằng mật khẩu, xem middleware ở đầu file)
// ==================================================

// ---- Products ----
app.get("/api/admin/products", (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});
app.post("/api/admin/products", (req, res) => {
  const { name, type, price, description, stock } = req.body || {};
  if (!name || !["physical", "digital", "service"].includes(type) || !price) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc." });
  }
  const finalStock = type === "physical" ? Number(stock || 0) : null;
  const info = db
    .prepare("INSERT INTO products (name, type, price, description, stock) VALUES (?, ?, ?, ?, ?)")
    .run(name, type, price, description || null, finalStock);
  res.json({ id: info.lastInsertRowid });
});
app.put("/api/admin/products/:id", (req, res) => {
  const { name, type, price, description, stock } = req.body || {};
  const finalStock = type === "physical" ? Number(stock || 0) : null;
  db.prepare(
    "UPDATE products SET name=?, type=?, price=?, description=?, stock=? WHERE id=?"
  ).run(name, type, price, description || null, finalStock, req.params.id);
  res.json({ success: true });
});
app.delete("/api/admin/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ---- Customers ----
app.get("/api/admin/customers", (req, res) => {
  res.json(db.prepare("SELECT * FROM customers ORDER BY id DESC").all());
});
app.post("/api/admin/customers", (req, res) => {
  const { name, phone, email, zalo } = req.body || {};
  if (!name) return res.status(400).json({ error: "Thiếu tên." });
  if (phone && !isValidPhone(phone)) return res.status(400).json({ error: "SĐT không hợp lệ." });
  if (email && !isValidEmail(email)) return res.status(400).json({ error: "Email không hợp lệ." });
  const info = db
    .prepare("INSERT INTO customers (name, phone, email, zalo) VALUES (?, ?, ?, ?)")
    .run(name, phone || null, email || null, zalo || null);
  res.json({ id: info.lastInsertRowid });
});
app.put("/api/admin/customers/:id", (req, res) => {
  const { name, phone, email, zalo } = req.body || {};
  if (phone && !isValidPhone(phone)) return res.status(400).json({ error: "SĐT không hợp lệ." });
  if (email && !isValidEmail(email)) return res.status(400).json({ error: "Email không hợp lệ." });
  db.prepare("UPDATE customers SET name=?, phone=?, email=?, zalo=? WHERE id=?").run(
    name,
    phone || null,
    email || null,
    zalo || null,
    req.params.id
  );
  res.json({ success: true });
});
app.delete("/api/admin/customers/:id", (req, res) => {
  db.prepare("DELETE FROM customers WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ---- Orders ----
app.get("/api/admin/orders", (req, res) => {
  const rows = db
    .prepare(
      `SELECT orders.*, customers.name AS customer_name, products.name AS product_name, products.type AS product_type
       FROM orders
       JOIN customers ON customers.id = orders.customer_id
       JOIN products ON products.id = orders.product_id
       ORDER BY orders.id DESC`
    )
    .all();
  res.json(rows);
});
app.post("/api/admin/orders", (req, res) => {
  // Admin tự thêm đơn hàng thủ công
  const { customer_id, product_id, amount, status } = req.body || {};
  const product = db.prepare("SELECT * FROM products WHERE id=?").get(product_id);
  if (!product) return res.status(400).json({ error: "Sản phẩm không tồn tại." });
  const insert = db
    .prepare("INSERT INTO orders (order_code, customer_id, product_id, amount, status) VALUES (?, ?, ?, ?, ?)")
    .run("TEMP", customer_id, product_id, amount || product.price, status || "pending");
  const orderId = insert.lastInsertRowid;
  const orderCode = makeOrderCode(orderId);
  db.prepare("UPDATE orders SET order_code=? WHERE id=?").run(orderCode, orderId);

  if ((status || "pending") === "success" && product.type === "physical" && product.stock !== null) {
    db.prepare("UPDATE products SET stock = MAX(stock - 1, 0) WHERE id=?").run(product.id);
  }
  res.json({ id: orderId, orderCode });
});
app.put("/api/admin/orders/:id", (req, res) => {
  // Dùng để admin kích hoạt "thanh toán thành công" bằng tay khi nội dung CK không khớp tự động
  const { status } = req.body || {};
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });

  if (status === "success" && order.status !== "success") {
    markOrderPaid(order, "manual-" + Date.now());
  } else {
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, req.params.id);
  }
  res.json({ success: true });
});
app.delete("/api/admin/orders/:id", (req, res) => {
  db.prepare("DELETE FROM orders WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// ==================================================
// Trang HTML
// ==================================================
app.get("/thanh-toan", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "thanh-toan.html"));
});
app.get("/dang-ky", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dang-ky.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
