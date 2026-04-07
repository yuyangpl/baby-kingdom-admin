import Config from './config.model.js';
import { NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';
import { encrypt, decrypt } from '../../shared/encryption.js';

function maskSecret(value) {
  if (!value || value.length <= 4) return '••••••••';
  return '••••••••' + value.slice(-4);
}

export async function listByCategory(category) {
  const filter = category ? { category } : {};
  const configs = await Config.find(filter).sort({ category: 1, key: 1 });
  return configs.map((c) => {
    const obj = c.toObject();
    if (obj.isSecret && obj.value) {
      try {
        obj.value = maskSecret(decrypt(obj.value));
      } catch {
        obj.value = '••••••••';
      }
    }
    return obj;
  });
}

export async function getAll() {
  return listByCategory(null);
}

export async function getValue(key) {
  const config = await Config.findOne({ key });
  if (!config) return null;
  if (config.isSecret && config.value) {
    try {
      return decrypt(config.value);
    } catch {
      return null;
    }
  }
  return config.value;
}

export async function updateValue(key, value, userId, ip) {
  const config = await Config.findOne({ key });
  if (!config) throw new NotFoundError('Config');

  const beforeValue = config.isSecret ? '[SECRET]' : config.value;
  const afterValue = config.isSecret ? '[SECRET UPDATED]' : value;

  config.value = config.isSecret ? encrypt(value) : value;
  config.updatedBy = userId;
  await config.save();

  await auditService.log({
    operator: userId,
    eventType: 'CONFIG_UPDATED',
    module: 'config',
    targetId: key,
    actionDetail: `Updated config ${key}`,
    before: { value: beforeValue },
    after: { value: afterValue },
    ip,
  });

  return config;
}

export async function seed(configs) {
  for (const c of configs) {
    const exists = await Config.findOne({ key: c.key });
    if (!exists) {
      const value = c.isSecret && c.value ? encrypt(c.value) : (c.value || '');
      await Config.create({ ...c, value });
    }
  }
}
