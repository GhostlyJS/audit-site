import nodemailer from 'nodemailer';
import { config } from './config.js';

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export const mailEnabled = () => !!(transport && config.notifyEmail);

export async function notifyLead(subject: string, text: string, replyTo: string): Promise<boolean> {
  if (!transport || !config.notifyEmail) {
    console.warn('[lead] SMTP non configuré : notification non envoyée (lead enregistré en base).');
    return false;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to: config.notifyEmail, replyTo, subject, text });
    return true;
  } catch (err) {
    console.error('[lead] échec de l’envoi de la notification :', err);
    return false;
  }
}
