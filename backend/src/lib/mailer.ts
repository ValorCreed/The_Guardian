import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { renderVerificationEmail, renderResetEmail, renderNotificationEmail } from './emailTemplates';

export type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!env.SMTP_HOST) {
    throw new Error('SMTP_HOST is not configured. Email sending is disabled.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' }
        : undefined,
    });
  }
  return transporter;
}

export function canSendEmail(): boolean {
  return Boolean(env.SMTP_HOST);
}

export async function sendMail(payload: MailPayload): Promise<boolean> {
  if (!canSendEmail()) return false;
  const tx = getTransporter();
  await tx.sendMail({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
  return true;
}

export async function sendVerificationCodeEmail(to: string, code: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Your Guardian verification code',
    html: renderVerificationEmail(code),
    text: `Your Guardian verification code is ${code}. It expires in ${env.CODE_EXPIRES_IN_MINUTES} minutes.`,
  });
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Reset your Guardian password',
    html: renderResetEmail(code),
    text: `Use code ${code} to reset your Guardian password. It expires in ${env.CODE_EXPIRES_IN_MINUTES} minutes.`,
  });
}

export async function sendGenericNotificationEmail(to: string, title: string, body: string): Promise<boolean> {
  return sendMail({
    to,
    subject: title,
    html: renderNotificationEmail(title, body),
    text: body,
  });
}