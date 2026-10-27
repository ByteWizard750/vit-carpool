import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly isConfigured: boolean;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('SMTP_USER') || '';
    const rawPass = this.config.get<string>('SMTP_PASS') || '';
    const pass = rawPass.replace(/\s+/g, '');
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.config.get('SMTP_PORT')) || 465;
    const secure = this.config.get<boolean>('SMTP_SECURE') ?? true;
    this.from = this.config.get<string>('SMTP_FROM') || `VIT Carpool <${user || 'vitcarpool.app@gmail.com'}>`;

    this.isConfigured = Boolean(user && pass);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`[EmailService] SMTP transporter configured for ${user} via ${host}:${port}`);
    } else {
      this.logger.warn(`[EmailService] SMTP credentials not configured. OTP emails will not be dispatched via SMTP.`);
    }
  }

  get isEmailConfigured(): boolean {
    return this.isConfigured;
  }

  async sendOtpEmail(
    to: string,
    otpCode: string,
    fullName?: string,
    intent: 'signup' | 'signin' = 'signup',
  ): Promise<void> {
    if (!this.transporter || !this.isConfigured) {
      this.logger.warn(`[EmailService] Skipping SMTP dispatch to ${to} (transporter not configured).`);
      return;
    }

    const recipientName = fullName?.trim() || 'VIT Member';
    const actionText = intent === 'signup' ? 'complete your registration' : 'sign in to your account';
    const subject = `Your VIT Carpool Verification Code: ${otpCode}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>VIT Carpool Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">VIT Chennai Carpool</h1>
      <p style="color: #e0f2fe; margin: 6px 0 0; font-size: 14px;">Campus Ride Sharing Platform</p>
    </div>
    <div style="padding: 32px 28px;">
      <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px;">Hello <strong>${recipientName}</strong>,</p>
      <p style="font-size: 15px; color: #475569; margin: 0 0 24px; line-height: 1.5;">
        Use the single-use verification code below to ${actionText} on the VIT Carpool platform:
      </p>
      <div style="background-color: #f1f5f9; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px; border: 1px dashed #cbd5e1;">
        <span style="font-family: monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #0284c7;">${otpCode}</span>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 12px; line-height: 1.5;">
        ⏱️ This code will expire in <strong>5 minutes</strong>. If you did not request this verification, please safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
        VIT Chennai Exclusive Community Ride Sharing • Confidential
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `Hello ${recipientName},\n\nYour VIT Carpool verification code is: ${otpCode}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, you can ignore this email.`;

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`[EmailService] OTP email sent successfully to ${to} (MessageId: ${info.messageId})`);
    } catch (err: any) {
      const sanitizedMessage = (err?.message || 'Unknown error').replace(
        /pass(word)?\s*[:=]\s*\S+/gi,
        'pass=***',
      );
      this.logger.error(`[EmailService] Failed to send OTP email to ${to}: ${sanitizedMessage}`);
      throw err;
    }
  }
}
