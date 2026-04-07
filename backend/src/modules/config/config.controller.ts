import { Request, Response } from 'express';
import * as configService from './config.service.js';
import { success } from '../../shared/response.js';

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
