import { Request, Response } from 'express';
import * as configService from './config.service.js';
import { success } from '../../shared/response.js';
import { sendAlert } from '../../shared/email.js';

export async function getAll(req: Request, res: Response): Promise<void> {
  const data = await configService.getAll();
  success(res, data);
}

export async function getByCategory(req: Request, res: Response): Promise<void> {
  const data = await configService.listByCategory(req.params.category as string);
  success(res, data);
}

export async function updateValue(req: Request, res: Response): Promise<void> {
  const { value } = req.body;
  const config = await configService.updateValue(req.params.key as string, value, (req as any).user.id, req.ip ?? '');
  success(res, { key: config.key, updated: true });
}

export async function revealSecret(req: Request, res: Response): Promise<void> {
  const value = await configService.revealSecret(req.params.key as string, (req as any).user.id, req.ip ?? '');
  success(res, { key: req.params.key, value });
}

export async function resetDefaults(req: Request, res: Response): Promise<void> {
  await configService.resetDefaults((req as any).user.id, req.ip ?? '');
  success(res, { reset: true });
}

export async function testEmail(req: Request, res: Response): Promise<void> {
  const adminEmail = await configService.getValue('ADMIN_EMAILS');
  const sent = await sendAlert(
    adminEmail || (req as any).user.email,
    'BK Admin — 測試郵件',
    '<p>這是一封測試郵件，確認 SMTP 設定正常。</p>',
    {
      host: await configService.getValue('SMTP_HOST') || undefined,
      port: parseInt(await configService.getValue('SMTP_PORT') || '587', 10),
      user: await configService.getValue('SMTP_USER') || undefined,
      pass: await configService.getValue('SMTP_PASS') || undefined,
      from: await configService.getValue('SMTP_FROM') || undefined,
    },
  );
  success(res, { sent });
}
