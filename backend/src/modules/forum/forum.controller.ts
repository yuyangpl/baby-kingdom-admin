import { Request, Response } from 'express';
import * as forumService from './forum.service.js';
import { success, created } from '../../shared/response.js';

export async function getTree(req: Request, res: Response): Promise<void> {
  const data = await forumService.getTree();
  success(res, data);
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const cat = await forumService.createCategory(req.body, (req as any).user.id, req.ip ?? '');
  created(res, cat);
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const cat = await forumService.updateCategory(req.params.id as string, req.body, (req as any).user.id, req.ip ?? '');
  success(res, cat);
}

export async function createBoard(req: Request, res: Response): Promise<void> {
  const board = await forumService.createBoard(req.body, (req as any).user.id, req.ip ?? '');
  created(res, board);
}

export async function updateBoard(req: Request, res: Response): Promise<void> {
  const board = await forumService.updateBoard(req.params.id as string, req.body, (req as any).user.id, req.ip ?? '');
  success(res, board);
}

export async function updateBoardPersonas(req: Request, res: Response): Promise<void> {
  const board = await forumService.updateBoardPersonas(req.params.id as string, req.body.personaBindings, (req as any).user.id, req.ip ?? '');
  success(res, board);
}

export async function deleteBoard(req: Request, res: Response): Promise<void> {
  await forumService.deleteBoard(req.params.id as string, (req as any).user.id, req.ip ?? '');
  success(res, null);
}
