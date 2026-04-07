import { ForumCategory, ForumBoard } from './forum.model.js';
import type { IPersonaBinding } from './forum.model.js';
import { NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';

export async function getTree() {
  const categories = await ForumCategory.find().sort({ sortOrder: 1 });
  const boards = await ForumBoard.find().populate('personaBindings.personaId', 'accountId username archetype');

  return categories.map((cat) => ({
    ...cat.toObject(),
    boards: boards
      .filter((b) => b.categoryId.toString() === cat._id.toString())
      .map((b) => b.toObject()),
  }));
}

// Categories
export async function createCategory(data: { name: string; sortOrder?: number }, userId: string, ip: string) {
  const cat = await ForumCategory.create(data);
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: cat._id.toString(), actionDetail: `Created category: ${cat.name}`, after: cat.toObject(), ip });
  return cat;
}

export async function updateCategory(id: string, data: Record<string, any>, userId: string, ip: string) {
  const cat = await ForumCategory.findById(id);
  if (!cat) throw new NotFoundError('ForumCategory');
  const before = cat.toObject();
  Object.assign(cat, data);
  await cat.save();
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated category: ${cat.name}`, before, after: cat.toObject(), ip });
  return cat;
}

// Boards
export async function createBoard(data: Record<string, any>, userId: string, ip: string) {
  const board = await ForumBoard.create(data);
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: board._id.toString(), actionDetail: `Created board: ${board.name} (fid=${board.fid})`, after: board.toObject(), ip });
  return board;
}

export async function updateBoard(id: string, data: Record<string, any>, userId: string, ip: string) {
  const board = await ForumBoard.findById(id);
  if (!board) throw new NotFoundError('ForumBoard');
  const before = board.toObject();

  // Handle personaBindings separately if not provided
  const { personaBindings, ...rest } = data;
  Object.assign(board, rest);
  if (personaBindings !== undefined) {
    board.personaBindings = personaBindings;
  }
  await board.save();

  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated board: ${board.name}`, before, after: board.toObject(), ip });
  return board;
}

export async function updateBoardPersonas(id: string, personaBindings: IPersonaBinding[], userId: string, ip: string) {
  const board = await ForumBoard.findById(id);
  if (!board) throw new NotFoundError('ForumBoard');
  const before = board.toObject();

  board.personaBindings = personaBindings;
  await board.save();

  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated persona bindings for ${board.name}`, before, after: board.toObject(), ip });
  return board;
}

export async function deleteBoard(id: string, userId: string, ip: string) {
  const board = await ForumBoard.findById(id);
  if (!board) throw new NotFoundError('ForumBoard');
  await ForumBoard.findByIdAndDelete(id);
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Deleted board: ${board.name}`, before: board.toObject(), ip });
}

export async function getActiveBoards() {
  return ForumBoard.find({ isActive: true, enableScraping: true })
    .populate('personaBindings.personaId', 'accountId username archetype isActive maxPostsPerDay postsToday');
}
