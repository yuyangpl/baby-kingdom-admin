import * as configService from './config.service.js';
import { success } from '../../shared/response.js';

export async function getAll(req, res) {
  const data = await configService.getAll();
  return success(res, data);
}

export async function getByCategory(req, res) {
  const data = await configService.listByCategory(req.params.category);
  return success(res, data);
}

export async function updateValue(req, res) {
  const { value } = req.body;
  const config = await configService.updateValue(req.params.key, value, req.user.id, req.ip);
  return success(res, { key: config.key, updated: true });
}
