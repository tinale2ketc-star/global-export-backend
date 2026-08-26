// utils.js — validate dữ liệu & tạo QR Sepay

function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = String(phone).trim().replace(/[.\s-]/g, "");
  return /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(cleaned);
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// Sinh mã đơn hàng dạng DH000123 dùng làm nội dung chuyển khoản
function makeOrderCode(id) {
  return "DH" + String(id).padStart(6, "0");
}

// Tạo URL ảnh QR VietQR động để khách quét chuyển khoản
// acc = số VA của Sepay (KHÔNG dùng số tài khoản chính)
function buildQrUrl({ amount, orderCode }) {
  const acc = process.env.SEPAY_VA_ACCOUNT;
  const bank = process.env.SEPAY_BANK || "BIDV";
  const params = new URLSearchParams({
    acc,
    bank,
    amount: String(amount),
    des: orderCode,
    template: "compact",
  });
  return `https://vietqr.app/img?${params.toString()}`;
}

module.exports = { isValidPhone, isValidEmail, makeOrderCode, buildQrUrl };
