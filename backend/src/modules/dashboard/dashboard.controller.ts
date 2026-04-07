import { Request, Response } from 'express';
import * as dashboardService from './dashboard.service.js';
import { success } from '../../shared/response.js';

export async function getRealtime(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getRealtime();
  success(res, data);
}

export async function getToday(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getToday();
  success(res, data);
}

export async function getRecent(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getRecent();
  success(res, data);
}

export async function getWeekly(req: Request, res: Response): Promise<void> {
  const data = await dashboardService.getWeekly();
  success(res, data);
}
