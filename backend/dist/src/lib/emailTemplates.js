"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVerificationEmail = renderVerificationEmail;
exports.renderResetEmail = renderResetEmail;
exports.renderNotificationEmail = renderNotificationEmail;
function layout(body) {
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1220;color:#e2e8f0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:800;color:#f8fafc;">🛡️ The Guardian</span>
    </div>
    ${body}
    <p style="font-size:12px;color:#64748b;text-align:center;margin-top:32px;">
      This email was sent by The Guardian. If you did not request it, no action is needed.
    </p>
  </div></body></html>`;
}
function renderVerificationEmail(code) {
    return layout(`
    <p style="font-size:15px;line-height:1.6;">Your verification code is:</p>
    <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:800;letter-spacing:10px;color:#60a5fa;margin:16px 0;">${code}</div>
    <p style="font-size:13px;color:#94a3b8;">This code expires shortly. Never share it with anyone.</p>
  `);
}
function renderResetEmail(code) {
    return layout(`
    <p style="font-size:15px;line-height:1.6;">We received a request to reset your Guardian password. Use this code:</p>
    <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:800;letter-spacing:10px;color:#fbbf24;margin:16px 0;">${code}</div>
    <p style="font-size:13px;color:#94a3b8;">If you did not request a password reset, you can safely ignore this email.</p>
  `);
}
function renderNotificationEmail(title, body) {
    return layout(`
    <div style="background:#0f1a2e;border-radius:12px;padding:24px;border:1px solid #1e293b;">
      <p style="font-size:16px;font-weight:700;color:#f8fafc;margin:0 0 8px;">${title}</p>
      <p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0;">${body}</p>
    </div>
  `);
}
//# sourceMappingURL=emailTemplates.js.map