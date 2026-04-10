import { Request, Response } from 'express';
import { NotFoundError } from './errors.js';
import { success, created, paginated } from './response.js';
import * as auditService from '../modules/audit/audit.service.js';
import { getPrisma } from './database.js';

const auditLog = auditService as unknown as { log: (data: Record<string, any>) => Promise<any> };

function filterBody(body: Record<string, unknown>, allowedFields?: string[]): Record<string, unknown> {
  if (!allowedFields) return body;
  const filtered: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) filtered[key] = body[key];
  }
  return filtered;
}

/**
 * Valid Prisma model names for dynamic access.
 * Must match the lowercase camelCase form of model names in schema.prisma.
 */
type PrismaModelName =
  | 'user' | 'config' | 'toneMode' | 'persona' | 'topicRule'
  | 'forumCategory' | 'forumBoard' | 'boardPersonaBinding'
  | 'googleTrend' | 'googleTrendNews' | 'feed' | 'trend'
  | 'queueJob' | 'dailyStats' | 'auditLog' | 'tokenBlacklist';

interface CrudOptions {
  defaultSort?: Record<string, 'asc' | 'desc'>;
  allowedFields?: string[];
  lookupField?: string;         // e.g. 'toneId', 'ruleId', 'accountId'
  allowedFilters?: string[];    // fields that can be used as query filters
}

/**
 * Build standard CRUD controller functions for a Prisma model.
 * Drop-in replacement for the Mongoose version.
 */
export function buildCrud(modelName: PrismaModelName, moduleName: string, options: CrudOptions = {}) {
  const { defaultSort = { createdAt: 'desc' }, allowedFields, lookupField, allowedFilters } = options;

  function getModel() {
    const prisma = getPrisma();
    return (prisma as any)[modelName];
  }

  /** Find by UUID id or custom lookupField */
  async function findDoc(id: string) {
    const model = getModel();
    // Try UUID first
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) {
      const doc = await model.findUnique({ where: { id } });
      if (doc) return doc;
    }
    // Try lookupField
    if (lookupField) {
      return model.findFirst({ where: { [lookupField]: id } });
    }
    return null;
  }

  return {
    async list(req: Request, res: Response) {
      const { page = 1, limit = 50, sort, ...filters } = req.query;
      const p = parseInt(page as string);
      const l = Math.min(parseInt(limit as string) || 50, 200);
      const skip = (p - 1) * l;

      // Build where — only use allowed filter fields
      const where: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(filters)) {
        if (allowedFilters && allowedFilters.includes(key)) {
          where[key] = val;
        } else if (!allowedFilters) {
          // If no allowedFilters specified, allow all (backwards compatible)
          where[key] = val;
        }
      }

      // Parse sort string like '-createdAt' into Prisma orderBy
      let orderBy: Record<string, 'asc' | 'desc'> = defaultSort;
      if (sort && typeof sort === 'string') {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        orderBy = { [field]: desc ? 'desc' : 'asc' };
      }

      const model = getModel();
      const [data, total] = await Promise.all([
        model.findMany({ where, orderBy, skip, take: l }),
        model.count({ where }),
      ]);

      return paginated(res, data, { page: p, limit: l, total, pages: Math.ceil(total / l) });
    },

    async getById(req: Request, res: Response) {
      const doc = await findDoc(req.params.id as string);
      if (!doc) throw new NotFoundError(moduleName);
      return success(res, doc);
    },

    async create(req: Request, res: Response) {
      const model = getModel();
      const doc = await model.create({ data: filterBody(req.body, allowedFields) });

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_CREATED`,
        module: moduleName,
        targetId: doc.id,
        actionDetail: `Created ${moduleName}`,
        after: doc,
        ip: req.ip,
      });

      return created(res, doc);
    },

    async update(req: Request, res: Response) {
      const doc = await findDoc(req.params.id as string);
      if (!doc) throw new NotFoundError(moduleName);

      const before = { ...doc };
      const model = getModel();
      const updated = await model.update({
        where: { id: doc.id },
        data: filterBody(req.body, allowedFields),
      });

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_UPDATED`,
        module: moduleName,
        targetId: doc.id,
        actionDetail: `Updated ${moduleName}`,
        before,
        after: updated,
        ip: req.ip,
      });

      return success(res, updated);
    },

    async remove(req: Request, res: Response) {
      const doc = await findDoc(req.params.id as string);
      if (!doc) throw new NotFoundError(moduleName);

      const model = getModel();
      await model.delete({ where: { id: doc.id } });

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_DELETED`,
        module: moduleName,
        targetId: doc.id,
        actionDetail: `Deleted ${moduleName}`,
        before: doc,
        ip: req.ip,
      });

      return success(res, null);
    },
  };
}
