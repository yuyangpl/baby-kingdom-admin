import * as dashboardService from './dashboard.service.js';
import { success } from '../../shared/response.js';

export async function getRealtime(req, res) {
  const data = await dashboardService.getRealtime();
  return success(res, data);
}

export async function getToday(req, res) {
  const data = await dashboardService.getToday();
  return success(res, data);
}

export async function getRecent(req, res) {
  const data = await dashboardService.getRecent();
  return success(res, data);
}

export async function getWeekly(req, res) {
  const data = await dashboardService.getWeekly();
  return success(res, data);
}
