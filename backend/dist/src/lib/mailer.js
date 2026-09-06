"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canSendEmail = canSendEmail;
exports.sendMail = sendMail;
exports.sendVerificationCodeEmail = sendVerificationCodeEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendGenericNotificationEmail = sendGenericNotificationEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
const emailTemplates_1 = require("./emailTemplates");
let transporter = null;
function getTransporter() {
    if (!env_1.env.SMTP_HOST) {
        throw new Error('SMTP_HOST is not configured. Email sending is disabled.');
    }
    if (!transporter) {
        transporter = nodemailer_1.default.createTransport({
            host: env_1.env.SMTP_HOST,
            port: env_1.env.SMTP_PORT ?? 587,
            secure: env_1.env.SMTP_SECURE,
            auth: env_1.env.SMTP_USER
                ? { user: env_1.env.SMTP_USER, pass: env_1.env.SMTP_PASS ?? '' }
                : undefined,
        });
    }
    return transporter;
}
function canSendEmail() {
    return Boolean(env_1.env.SMTP_HOST);
}
async function sendMail(payload) {
    if (!canSendEmail())
        return false;
    const tx = getTransporter();
    await tx.sendMail({
        from: env_1.env.EMAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
    });
    return true;
}
async function sendVerificationCodeEmail(to, code) {
    return sendMail({
        to,
        subject: 'Your Guardian verification code',
        html: (0, emailTemplates_1.renderVerificationEmail)(code),
        text: `Your Guardian verification code is ${code}. It expires in ${env_1.env.CODE_EXPIRES_IN_MINUTES} minutes.`,
    });
}
async function sendPasswordResetEmail(to, code) {
    return sendMail({
        to,
        subject: 'Reset your Guardian password',
        html: (0, emailTemplates_1.renderResetEmail)(code),
        text: `Use code ${code} to reset your Guardian password. It expires in ${env_1.env.CODE_EXPIRES_IN_MINUTES} minutes.`,
    });
}
async function sendGenericNotificationEmail(to, title, body) {
    return sendMail({
        to,
        subject: title,
        html: (0, emailTemplates_1.renderNotificationEmail)(title, body),
        text: body,
    });
}
//# sourceMappingURL=mailer.js.map