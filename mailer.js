// mailer.js — Gửi email tự động qua Resend
//
// Nội dung 4 email lấy từ email_sequence.md, viết theo brand voice thật trong brain.db.
//
// CẦN ĐẶT BIẾN MÔI TRƯỜNG trên Render:
//   RESEND_API_KEY  — bắt buộc. Lấy ở resend.com > API keys. KHÔNG bao giờ ghi vào file này.
//   MAIL_FROM       — không bắt buộc, mặc định 'Tina Lê <hi@crewinthetown.com>'
//   MAIL_REPLY_TO   — không bắt buộc, mặc định 'hello.globalexport5@gmail.com'
//
// VÌ SAO HẸN GIỜ BẰNG RESEND CHỨ KHÔNG BẰNG setTimeout:
// Render gói miễn phí cho service ngủ sau ~15 phút không có request. Mọi bộ đếm giờ
// chạy trong tiến trình Node sẽ chết theo giấc ngủ đó, Email 2 và 3 sẽ không bao giờ
// được gửi. Nên ngay lúc khách đăng ký, ta giao cả 3 email cho Resend kèm tham số
// scheduled_at — Resend giữ lịch và tự gửi, server ngủ bao lâu cũng không ảnh hưởng.

const API_BASE = process.env.RESEND_API_BASE || "https://api.resend.com";
const FROM = process.env.MAIL_FROM || "Tina Lê <hi@crewinthetown.com>";
const REPLY_TO = process.env.MAIL_REPLY_TO || "hello.globalexport5@gmail.com";
const TRANG_THANH_TOAN = "https://pay.crewinthetown.com/thanh-toan";
const ZALO = "0869395647";

// ==================================================
// Hàm gọi Resend
// ==================================================
async function guiEmail({ to, subject, text, scheduledAt }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[mail] Bỏ qua: chưa đặt RESEND_API_KEY trên Render.");
    return { skipped: true };
  }

  const body = {
    from: FROM,
    to: [to],
    reply_to: REPLY_TO,
    subject,
    text,
    html: textSangHtml(text),
  };
  if (scheduledAt) body.scheduled_at = scheduledAt;

  const res = await fetch(`${API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend trả về ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Chuyển bản text sang HTML đơn giản, giữ nguyên ngắt đoạn.
// Không dùng thư viện ngoài để đỡ thêm phụ thuộc.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textSangHtml(text) {
  const doan = escapeHtml(text)
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  // Biến URL trần thành link bấm được
  const coLink = doan.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#1B3A6B">$1</a>'
  );
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;
     font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
     font-size:15px;line-height:1.7;color:#1a1a1a">
${coLink}
</div></body></html>`;
}

// ==================================================
// Nội dung email
// ==================================================
function chao(ten) {
  const t = (ten || "").trim();
  return t ? `Chào ${t},` : "Chào bạn,";
}

const KY_TEN = `Nghiệp vụ là gốc. AI là đòn bẩy.

Tina
Global Export 5.0`;

const CHAN_THU = `---
Bạn nhận email này vì đã đăng ký tại crewinthetown.com.
Không muốn nhận nữa thì bấm trả lời, ghi "dừng" — tôi gỡ ngay.`;

function email1(ten) {
  return {
    subject: "Tôi nhận được đăng ký của bạn rồi",
    text: `${chao(ten)}

Cảm ơn bạn đã để lại thông tin.

Tôi là Tina. Mấy năm nay tôi ngồi trong phòng xuất nhập khẩu của những công ty dưới 20 người — chỗ mà một người vừa tìm buyer, vừa làm chứng từ, vừa theo lô hàng, vừa trả lời email lúc mười một giờ đêm vì buyer bên kia địa cầu mới vừa ngủ dậy.

Global Export 5.0 sinh ra từ chỗ đó. Không sinh ra từ một ý tưởng công nghệ.

Vài ngày tới bạn sẽ nhận thêm hai email từ tôi.

Một cái kể về cái điểm nghẽn mà gần như phòng xuất nhập khẩu nào cũng dính, nhưng ít ai gọi đúng tên nó ra.

Một cái nói thẳng tôi đang có gì, giá bao nhiêu, hợp với ai — và không hợp với ai.

Còn email này thì không bán gì cả. Chỉ chào bạn một tiếng cho tử tế.

Mà nếu bạn đang có một câu hỏi cụ thể — buyer im lặng sau khi nhận báo giá, chứng từ bị ngân hàng trả về, nhân sự nghỉ việc mang theo cả danh sách khách — thì bấm trả lời email này. Tôi đọc thật, không phải hộp thư tự động.

${KY_TEN}`,
  };
}

function email2(ten) {
  return {
    subject: "Buyer hỏi hàng lúc hai giờ sáng, và người trả lời trước là người được báo giá",
    text: `${chao(ten)}

Có một chuyện xảy ra gần như mỗi tuần, ở gần như mọi công ty xuất khẩu Việt Nam, mà lạ là ít ai đem ra bàn.

Buyer ở châu Âu hoặc Mỹ gửi thư hỏi hàng vào giờ làm việc của họ. Tức là lúc Việt Nam đang ngủ.

Sáng hôm sau mình dậy, pha ly cà phê, mở hộp thư, thấy thư hỏi giá. Mừng. Ngồi soạn báo giá tử tế, đính kèm catalogue, gửi đi lúc chín giờ sáng.

Nhưng thư đó đã nằm trong hộp thư của họ mười hai tiếng rồi.

Và trong mười hai tiếng đó, buyer thường không ngồi chờ một mình. Họ gửi cùng lúc cho năm nhà cung cấp ở năm nước.

Vậy thì cái mình mất là gì? Không phải mất điểm lịch sự. Là mất lượt được báo giá — cái lượt mà người trả lời trước đã lấy mất rồi.

Chỗ này tôi thấy nhiều người sửa sai hướng: họ nghĩ phải viết báo giá hay hơn, đẹp hơn, chuyên nghiệp hơn. Trong khi thứ quyết định lại là ai chạm vào buyer trước.

Bốn thứ có thể làm ngay, không cần mua gì của ai:

1. Soạn sẵn một mẫu trả lời trong ba dòng cho thư hỏi hàng lần đầu. Không cần đủ giá. Chỉ cần xác nhận đã nhận, hỏi lại số lượng và cảng đến, hẹn giờ gửi báo giá đầy đủ. Ba dòng đó giữ được lượt.

2. Bật thông báo riêng cho hộp thư bán hàng. Đừng để nó chung với thư rác và hóa đơn.

3. Ghi lại buyer hỏi vào khung giờ nào. Sau một tháng bạn sẽ thấy một quy luật, và biết mình cần trực vào khung nào.

4. Đừng để nguyên câu hỏi của buyer nằm trong inbox cá nhân của một nhân viên. Người đó nghỉ phép là cả lô hàng nghỉ theo.

Cái thứ tư mới là cái đắt nhất, và cũng là cái ít người làm nhất.

${KY_TEN}

${CHAN_THU}`,
  };
}

function email3(ten) {
  return {
    subject: "Ba thứ tôi đang có, giá thật, và ai không nên mua",
    text: `${chao(ten)}

Hai email trước tôi không bán gì. Email này thì có, và tôi nói thẳng luôn để bạn khỏi mất thời gian đọc vòng vo.

Tôi đang có ba thứ. Mỗi thứ chạy độc lập được, không bắt mua trọn gói.


1. KHÓA HỌC: CÁC CÁCH TÌM KHÁCH XUẤT KHẨU — 1.490.000đ / học viên

Toàn bộ kênh tìm buyer đang thực sự ra đơn, kèm cách dùng AI rút ngắn từng bước. Bản đồ chín kênh: hội chợ, sàn B2B, LinkedIn, dữ liệu hải quan. Quy trình thẩm định buyer trước khi báo giá. Cold email và follow-up theo phễu bảy chạm. Đàm phán giá, Incoterms, điều khoản thanh toán.

Hợp với: người đang tự tìm khách mà chưa có hệ thống.


2. BỘ CÔNG CỤ AI CHO 5 NHÂN VIÊN — 3.000.000đ (giá gốc 5.000.000đ)

Thư viện prompt và trợ lý AI dựng riêng cho từng vị trí trong phòng xuất nhập khẩu: Sales, Chứng từ, Purchasing, Quản lý. Cấp năm tài khoản, lộ trình triển khai bảy ngày.

Hợp với: phòng đã có người, đang mất thời gian vào việc lặp đi lặp lại.


3. CHATBOT AI TRỰC KHÁCH 24/7 — 26.300.000đ / triển khai

Đây chính là câu trả lời cho email hôm trước. Trợ lý trả lời buyer quốc tế lệch múi giờ, đọc đúng catalogue và bảng giá của bạn, nói được tiếng Anh, Trung, Nhật, Hàn, Tây Ban Nha. Gắn vào website, Messenger, WhatsApp, Zalo OA. Chấm điểm và chuyển lead nóng về sales kèm bản ghi hội thoại.

Hợp với: công ty đã có luồng khách hỏi đều, đang để rơi vào ban đêm.


AI KHÔNG NÊN MUA

Nếu quy trình chứng từ của bạn đang rối, hoặc chưa có nguồn khách nào đều đặn, thì đừng mua cái nào trong ba cái trên vội.

Cắm AI vào một quy trình rối chỉ làm nó rối nhanh hơn. Tôi nói thật vậy đó.

Trường hợp đó thì bấm trả lời email này, kể tôi nghe bạn đang mắc ở đâu. Có khi thứ bạn cần chỉ là sắp lại thứ tự, chưa cần mua gì.


Còn nếu bạn đã rõ mình cần gì:

Chọn gói và thanh toán tại: ${TRANG_THANH_TOAN}

Quét mã QR là xong, hệ thống tự ghi nhận đơn, bạn nhận email xác nhận ngay.

Buyer không mua giải pháp. Buyer mua sự chắc chắn. Tôi nghĩ người bán hàng cho bạn cũng nên vậy.

${KY_TEN}
Zalo / Hotline: ${ZALO}

${CHAN_THU}`,
  };
}

function emailXacNhanDon({ ten, maDon, tenSanPham, soTien, thoiGian }) {
  const tien = Number(soTien || 0).toLocaleString("vi-VN") + "đ";
  return {
    subject: `Đã nhận thanh toán — đơn ${maDon}`,
    text: `${chao(ten)}

Tôi đã nhận được thanh toán của bạn. Cảm ơn bạn thật sự.

    Mã đơn:      ${maDon}
    Hạng mục:    ${tenSanPham}
    Số tiền:     ${tien}
    Thời gian:   ${thoiGian}

Tiếp theo thế nào:

Trong vòng hai mươi bốn giờ làm việc, tôi hoặc người trong đội sẽ liên hệ bạn qua số điện thoại bạn đã điền, để hẹn buổi bàn giao và thống nhất lịch triển khai.

Nếu bạn cần gấp hơn, hoặc muốn đổi số liên hệ, bấm trả lời email này hoặc nhắn Zalo ${ZALO}.

Giữ lại email này nhé — mã đơn ${maDon} là thứ tôi tra khi bạn cần hỗ trợ.

${KY_TEN}`,
  };
}

// ==================================================
// Luồng gửi
// ==================================================

// Chế độ test theo yêu cầu SOP: địa chỉ chứa "+test" thì gửi cả 3 ngay,
// không chờ lịch — để kiểm tra trong vài phút thay vì ba ngày.
function laEmailTest(email) {
  return String(email || "").toLowerCase().includes("+test");
}

function congNgay(soNgay) {
  return new Date(Date.now() + soNgay * 24 * 60 * 60 * 1000).toISOString();
}

async function guiChuoiChaoMung({ ten, email }) {
  if (!email) return { skipped: true, reason: "khách không để lại email" };

  const test = laEmailTest(email);
  const lich = [
    { ...email1(ten), scheduledAt: null },
    { ...email2(ten), scheduledAt: test ? null : congNgay(2) },
    { ...email3(ten), scheduledAt: test ? null : congNgay(3) },
  ];

  const ketQua = [];
  for (const e of lich) {
    try {
      const r = await guiEmail({
        to: email,
        subject: e.subject,
        text: e.text,
        scheduledAt: e.scheduledAt,
      });
      ketQua.push({ subject: e.subject, ok: true, id: r.id, scheduledAt: e.scheduledAt });
    } catch (err) {
      console.error(`[mail] Lỗi gửi "${e.subject}" tới ${email}:`, err.message);
      ketQua.push({ subject: e.subject, ok: false, error: err.message });
    }
  }
  console.log(
    `[mail] Chuỗi chào mừng -> ${email}${test ? " (CHẾ ĐỘ TEST: gửi cả 3 ngay)" : ""}: ` +
      ketQua.map((r) => (r.ok ? "ok" : "LỖI")).join(", ")
  );
  return { test, ketQua };
}

async function guiXacNhanDon(thongTin) {
  if (!thongTin.email) return { skipped: true, reason: "đơn không có email" };
  const e = emailXacNhanDon(thongTin);
  try {
    const r = await guiEmail({ to: thongTin.email, subject: e.subject, text: e.text });
    console.log(`[mail] Xác nhận đơn ${thongTin.maDon} -> ${thongTin.email}: ok`);
    return { ok: true, id: r.id };
  } catch (err) {
    console.error(`[mail] Lỗi gửi xác nhận đơn ${thongTin.maDon}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  guiChuoiChaoMung,
  guiXacNhanDon,
  laEmailTest,
  _noiBo: { guiEmail, email1, email2, email3, emailXacNhanDon, textSangHtml },
};
