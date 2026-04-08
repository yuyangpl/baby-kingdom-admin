import { Request, Response } from 'express';
import { Model } from 'mongoose';
import { NotFoundError } from './errors.js';
import { success, created, paginated } from './response.js';
import * as auditService from '../modules/audit/audit.service.js';

const auditLog = auditService as unknown as { log: (data: Record<string, any>) => Promise<any> };

/**
 * Build standard CRUD controller functions for a Mongoose model.
 */
function filterBody(body: Record<string, unknown>, allowedFields?: string[]): Record<string, unknown> {
  if (!allowedFields) return body;
  const filtered: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) filtered[key] = body[key];
  }
  return filtered;
}

export function buildCrud(ModelRef: Model<any>, moduleName: string, options: { defaultSort?: string; allowedFields?: string[]; lookupField?: string } = {}) {
  const { defaultSort = '-createdAt', allowedFields, lookupField } = options;
  const resourceName = ModelRef.modelName;

  /** Find by _id or custom lookupField */
  async function findDoc(id: string) {
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      const doc = await ModelRef.findById(id);
      if (doc) return doc;
    }
    if (lookupField) {
      return ModelRef.findOne({ [lookupField]: id });
    }
    return null;
  }

  return {
    async list(req: Request, res: Response) {
      const { page = 1, limit = 50, sort, ...filters } = req.query;
      const p = parseInt(page as string);
      const l = Math.min(parseInt(limit as string) || 50, 200);
      const skip = (p - 1) * l;

      // Build filter — only use known fields
      const query: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(filters)) {
        if (ModelRef.schema.path(key)) {
          query[key] = val;
        }
      }

      const [data, total] = await Promise.all([
        ModelRef.find(query).sort((sort as string) || defaultSort).skip(skip).limit(l),
        ModelRef.countDocuments(query),
      ]);

      return paginated(res, data, { page: p, limit: l, total, pages: Math.ceil(total / l) });
    },

    async getById(req: Request, res: Response) {
      const doc = await findDoc(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);
      return success(res, doc);
    },

    async create(req: Request, res: Response) {
      const doc = await ModelRef.create(filterBody(req.body, allowedFields));

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_CREATED`,
        module: moduleName,
        targetId: doc._id.toString(),
        actionDetail: `Created ${resourceName}`,
        after: doc.toObject(),
        ip: req.ip,
      });

      return created(res, doc);
    },

    async update(req: Request, res: Response) {
      const doc = await findDoc(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);

      const before = doc.toObject();
      Object.assign(doc, filterBody(req.body, allowedFields));
      await doc.save();

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_UPDATED`,
        module: moduleName,
        targetId: doc._id.toString(),
        actionDetail: `Updated ${resourceName}`,
        before,
        after: doc.toObject(),
        ip: req.ip,
      });

      return success(res, doc);
    },

    async remove(req: Request, res: Response) {
      const doc = await findDoc(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);

      await ModelRef.findByIdAndDelete(doc._id);

      await auditLog.log({
        operator: req.user?.id || 'system',
        eventType: `${moduleName.toUpperCase()}_DELETED`,
        module: moduleName,
        targetId: doc._id.toString(),
        actionDetail: `Deleted ${resourceName}`,
        before: doc.toObject(),
        ip: req.ip,
      });

      return success(res, null);
    },
  };
}
