import { NotFoundError } from './errors.js';
import { success, created, paginated } from './response.js';
import * as auditService from '../modules/audit/audit.service.js';

/**
 * Build standard CRUD controller functions for a Mongoose model.
 * @param {mongoose.Model} Model
 * @param {string} moduleName - for audit logging
 * @param {object} options - { defaultSort, uniqueField }
 */
function filterBody(body, allowedFields) {
  if (!allowedFields) return body;
  const filtered = {};
  for (const key of allowedFields) {
    if (key in body) filtered[key] = body[key];
  }
  return filtered;
}

export function buildCrud(Model, moduleName, options = {}) {
  const { defaultSort = '-createdAt', allowedFields } = options;
  const resourceName = Model.modelName;

  return {
    async list(req, res) {
      const { page = 1, limit = 50, sort, ...filters } = req.query;
      const p = parseInt(page);
      const l = Math.min(parseInt(limit) || 50, 200);
      const skip = (p - 1) * l;

      // Build filter — only use known fields
      const query = {};
      for (const [key, val] of Object.entries(filters)) {
        if (Model.schema.path(key)) {
          query[key] = val;
        }
      }

      const [data, total] = await Promise.all([
        Model.find(query).sort(sort || defaultSort).skip(skip).limit(l),
        Model.countDocuments(query),
      ]);

      return paginated(res, data, { page: p, limit: l, total, pages: Math.ceil(total / l) });
    },

    async getById(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);
      return success(res, doc);
    },

    async create(req, res) {
      const doc = await Model.create(filterBody(req.body, allowedFields));

      await auditService.log({
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

    async update(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);

      const before = doc.toObject();
      Object.assign(doc, filterBody(req.body, allowedFields));
      await doc.save();

      await auditService.log({
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

    async remove(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new NotFoundError(resourceName);

      await Model.findByIdAndDelete(req.params.id);

      await auditService.log({
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
