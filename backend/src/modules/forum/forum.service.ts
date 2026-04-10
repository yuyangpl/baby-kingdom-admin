import { getPrisma } from '../../shared/database.js';
import { NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';

export async function getTree() {
  const prisma = getPrisma();
  const categories = await prisma.forumCategory.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  const boards = await prisma.forumBoard.findMany({
    include: {
      personaBindings: {
        include: {
          persona: {
            select: { accountId: true, username: true, archetype: true },
          },
        },
      },
    },
  });

  return categories.map((cat) => ({
    ...cat,
    boards: boards.filter((b) => b.categoryId === cat.id),
  }));
}

// Categories
export async function createCategory(data: { name: string; sortOrder?: number }, userId: string, ip: string) {
  const prisma = getPrisma();
  const cat = await prisma.forumCategory.create({ data });
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: cat.id, actionDetail: `Created category: ${cat.name}`, after: cat, ip });
  return cat;
}

export async function updateCategory(id: string, data: Record<string, any>, userId: string, ip: string) {
  const prisma = getPrisma();
  const cat = await prisma.forumCategory.findUnique({ where: { id } });
  if (!cat) throw new NotFoundError('ForumCategory');
  const before = { ...cat };
  const updated = await prisma.forumCategory.update({ where: { id }, data });
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated category: ${updated.name}`, before, after: updated, ip });
  return updated;
}

// Boards
export async function createBoard(data: Record<string, any>, userId: string, ip: string) {
  const prisma = getPrisma();
  const { personaBindings, replyThreshold, ...boardData } = data;

  // Flatten replyThreshold from nested object
  if (replyThreshold) {
    boardData.replyThresholdMin = replyThreshold.min ?? 0;
    boardData.replyThresholdMax = replyThreshold.max ?? 40;
  }

  const board = await prisma.forumBoard.create({ data: boardData as any });

  // Create persona bindings if provided
  if (personaBindings?.length) {
    for (const binding of personaBindings) {
      await prisma.boardPersonaBinding.create({
        data: {
          boardId: board.id,
          personaId: binding.personaId,
          toneMode: binding.toneMode,
          weight: binding.weight || 'medium',
          dailyLimit: binding.dailyLimit ?? 3,
        },
      });
    }
  }

  const result = await prisma.forumBoard.findUnique({
    where: { id: board.id },
    include: { personaBindings: { include: { persona: true } } },
  });

  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: board.id, actionDetail: `Created board: ${board.name} (fid=${board.fid})`, after: result, ip });
  return result;
}

export async function updateBoard(id: string, data: Record<string, any>, userId: string, ip: string) {
  const prisma = getPrisma();
  const board = await prisma.forumBoard.findUnique({
    where: { id },
    include: { personaBindings: true },
  });
  if (!board) throw new NotFoundError('ForumBoard');
  const before = { ...board };

  const { personaBindings, replyThreshold, ...rest } = data;

  // Flatten replyThreshold
  if (replyThreshold) {
    rest.replyThresholdMin = replyThreshold.min ?? board.replyThresholdMin;
    rest.replyThresholdMax = replyThreshold.max ?? board.replyThresholdMax;
  }

  const updated = await prisma.forumBoard.update({ where: { id }, data: rest });

  // Update persona bindings if provided (replace all in transaction)
  if (personaBindings !== undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.boardPersonaBinding.deleteMany({ where: { boardId: id } });
      if (personaBindings?.length) {
        for (const binding of personaBindings) {
          await tx.boardPersonaBinding.create({
            data: {
              boardId: id,
              personaId: binding.personaId,
              toneMode: binding.toneMode,
              weight: binding.weight || 'medium',
              dailyLimit: binding.dailyLimit ?? 3,
            },
          });
        }
      }
    });
  }

  const result = await prisma.forumBoard.findUnique({
    where: { id },
    include: { personaBindings: { include: { persona: true } } },
  });

  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated board: ${updated.name}`, before, after: result, ip });
  return result;
}

export async function updateBoardPersonas(id: string, personaBindings: any[], userId: string, ip: string) {
  const prisma = getPrisma();
  const board = await prisma.forumBoard.findUnique({
    where: { id },
    include: { personaBindings: true },
  });
  if (!board) throw new NotFoundError('ForumBoard');
  const before = { ...board };

  // Replace all bindings in transaction
  await prisma.$transaction(async (tx) => {
    await tx.boardPersonaBinding.deleteMany({ where: { boardId: id } });
    if (personaBindings?.length) {
      for (const binding of personaBindings) {
        await tx.boardPersonaBinding.create({
          data: {
            boardId: id,
            personaId: binding.personaId,
            toneMode: binding.toneMode,
            weight: binding.weight || 'medium',
            dailyLimit: binding.dailyLimit ?? 3,
          },
        });
      }
    }
  });

  const result = await prisma.forumBoard.findUnique({
    where: { id },
    include: { personaBindings: { include: { persona: true } } },
  });

  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Updated persona bindings for ${board.name}`, before, after: result, ip });
  return result;
}

export async function deleteBoard(id: string, userId: string, ip: string) {
  const prisma = getPrisma();
  const board = await prisma.forumBoard.findUnique({ where: { id } });
  if (!board) throw new NotFoundError('ForumBoard');
  await prisma.forumBoard.delete({ where: { id } });  // cascades to bindings
  await auditService.log({ operator: userId, eventType: 'FORUM_UPDATED', module: 'forum', targetId: id, actionDetail: `Deleted board: ${board.name}`, before: board, ip });
}

export async function getActiveBoards() {
  const prisma = getPrisma();
  return prisma.forumBoard.findMany({
    where: { isActive: true, enableScraping: true },
    include: {
      personaBindings: {
        include: {
          persona: {
            select: {
              id: true, accountId: true, username: true, archetype: true,
              isActive: true, maxPostsPerDay: true, postsToday: true,
            },
          },
        },
      },
    },
  });
}
