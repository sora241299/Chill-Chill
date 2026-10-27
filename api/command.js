// Vercel Serverless Function: nhận chỉ đạo của Founder, gọi Claude, trả về đề án JSON.
// Biến môi trường cần đặt trên Vercel: ANTHROPIC_API_KEY, APP_PASSWORD
// (tùy chọn) ANTHROPIC_MODEL, mặc định claude-sonnet-5-5
const crypto = require('crypto');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const DEPT_KEYS = ['creative', 'cosplay', 'event', 'business', 'operations'];

const SYSTEM_PROMPT = `Bạn là Claude Orchestrator, Giám đốc Điều hành AI của Sora Group (công ty sự kiện, cosplay và nội dung số). Founder/CEO là người duyệt cuối.

Nhiệm vụ: nhận chỉ đạo chiến lược, phân rã xuống 5 phòng ban, rồi KIỂM DUYỆT nội dung trước khi trình Founder.

Danh sách AI Agent (dùng đúng id khi giao việc):
- HQ: claude_main (Trợ Lý Trưởng), sora_orch (Điều Phối Viên)
- creative: trend_scout (Săn Trend & Kịch Bản), video_editor (Dựng Video & VFX)
- cosplay: talent_match (Casting & Talent), costume_viz (Design Costume 3D)
- event: show_planner (Đạo Diễn Timeline), tech_stage (Kỹ Thuật Stage & LED), booth_coordinator (Quản Lý Booth)
- business: sponsor_hunter (Săn Tài Trợ), ad_optimizer (Ads & Campaign)
- operations: legal_guard (Pháp Lý & Hợp Đồng), finance_tracker (Kế Toán & Ngân Sách), hr_recruiter (Tuyển Dụng & Nhân Sự)

Quy tắc:
- Dữ liệu hiện tại của hệ thống chỉ là MÔ PHỎNG, chưa có số thực. Mọi con số ngân sách, doanh thu, KPI là GIẢ ĐỊNH hợp lý do bạn ước tính; hãy nêu rõ trong "assumptions". Không bịa số liệu như thể đã có thật.
- Dùng tiếng Việt. Tiền ghi dạng "120,000,000 VNĐ". Tổng ngân sách các phòng phải khớp total_budget.
- Mỗi phòng tối đa 3 tasks, 3 kpis, 2 risks; mô tả ngắn gọn.
- Kiểm duyệt (compliance): kiểm tra bản quyền (nhạc, hình ảnh, nhân vật, thương hiệu), quy định nền tảng, cam kết quảng cáo quá mức hoặc số liệu chưa kiểm chứng, thiếu ghi chú tài trợ, nội dung nhạy cảm hoặc phản cảm, thông tin cá nhân của talent, giấy phép sự kiện. status là một trong "Đạt", "Cần sửa", "Từ chối". Ghi rõ lý do trong notes, và gắn cờ các mục cần Founder xem kỹ (nhạc, nhà tài trợ, hình ảnh talent). Bạn không thể xác minh giấy phép thật nên hãy nói rõ điều cần xác minh.
- Nếu chỉ đạo vi phạm pháp luật hoặc có hại thì status "Từ chối" và giải thích.
- Nếu có feedback từ Founder, chỉnh đề án trước đó theo đúng feedback.

CHỈ trả về một đối tượng JSON hợp lệ, không có văn bản nào khác, không dùng markdown. Cấu trúc:
{
 "title": string, "summary": string, "total_budget": string, "expected_revenue": string,
 "assumptions": [string],
 "compliance": { "status": "Đạt"|"Cần sửa"|"Từ chối", "notes": [string] },
 "departments": {
   "creative"|"cosplay"|"event"|"business"|"operations": {
     "title": string, "desc": string, "budget": string, "revenue": string,
     "tasks": [ { "agent_id": string, "task": string, "deadline": string } ],
     "kpis": [string],
     "risks": [ { "risk": string, "mitigation": string } ]
   }
 },
 "timeline": [ { "when": string, "what": string } ]
}`;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Claude không trả về JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Đề án không hợp lệ.');
  if (!plan.departments || typeof plan.departments !== 'object') throw new Error('Đề án thiếu phần phòng ban.');
  for (const k of DEPT_KEYS) {
    if (!plan.departments[k]) throw new Error('Đề án thiếu phòng ' + k + '.');
  }
  if (!plan.compliance || !['Đạt', 'Cần sửa', 'Từ chối'].includes(plan.compliance.status)) {
    plan.compliance = { status: 'Cần sửa', notes: ['Claude chưa trả về kết quả kiểm duyệt hợp lệ, cần chạy lại.'] };
  }
  return plan;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const appPassword = process.env.APP_PASSWORD;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!appPassword || !apiKey) {
    return res.status(500).json({ error: 'Server chưa cấu hình ANTHROPIC_API_KEY hoặc APP_PASSWORD.' });
  }
  if (!safeEqual(req.headers['x-app-password'] || '', appPassword)) {
    return res.status(401).json({ error: 'Sai mật khẩu.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  if (!command || command.length > 2000 || feedback.length > 2000) {
    return res.status(400).json({ error: 'Chỉ đạo trống hoặc quá dài (tối đa 2000 ký tự).' });
  }

  const messages = [{ role: 'user', content: 'CHỈ ĐẠO CỦA FOUNDER:\n' + command }];
  if (feedback && body.previousPlan) {
    const prev = JSON.stringify(body.previousPlan);
    if (prev.length > 30000) return res.status(400).json({ error: 'Đề án trước đó quá lớn.' });
    messages.push({ role: 'assistant', content: prev });
    messages.push({ role: 'user', content: 'FEEDBACK CỦA FOUNDER, hãy chỉnh đề án và trả lại JSON đầy đủ:\n' + feedback });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: SYSTEM_PROMPT, messages })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Anthropic API error', r.status, JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: 'Claude API lỗi (' + r.status + '): ' + ((data && data.error && data.error.message) || 'không rõ') });
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const plan = validatePlan(extractJson(text));
    return res.status(200).json({ plan });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Không đọc được đề án từ Claude, hãy thử gửi lại. (' + err.message + ')' });
  }
};
