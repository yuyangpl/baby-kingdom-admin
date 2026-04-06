import * as forumService from './forum.service.js';
import { success, created } from '../../shared/response.js';

export async function getTree(req, res) {
  const data = await forumService.getTree();
  return success(res, data);
}

export async function createCategory(req, res) {
  const cat = await forumService.createCategory(req.body, req.user.id, req.ip);
  return created(res, cat);
}

export async function updateCategory(req, res) {
  const cat = await forumService.updateCategory(req.params.id, req.body, req.user.id, req.ip);
  return success(res, cat);
}

export async function createBoard(req, res) {
  const board = await forumService.createBoard(req.body, req.user.id, req.ip);
  return created(res, board);
}

export async function updateBoard(req, res) {
  const board = await forumService.updateBoard(req.params.id, req.body, req.user.id, req.ip);
  return success(res, board);
}

export async function updateBoardPersonas(req, res) {
  const board = await forumService.updateBoardPersonas(req.params.id, req.body.personaBindings, req.user.id, req.ip);
  return success(res, board);
}

export async function deleteBoard(req, res) {
  await forumService.deleteBoard(req.params.id, req.user.id, req.ip);
  return success(res, null);
}
