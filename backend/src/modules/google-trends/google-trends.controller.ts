import { Request, Response } from 'express';
import * as googleTrendsService from './google-trends.service.js';
import { success, paginated } from '../../shared/response.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, relevance, safeOnly } = req.query;
  const result = await googleTrendsService.list({
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    relevance: relevance as string,
    safeOnly: safeOnly as string,
  });
  paginated(res, result.data, result.pagination);
}

export async function trigger(req: Request, res: Response): Promise<void> {
  const result = await googleTrendsService.pullAndStore();
  success(res, result);
}
