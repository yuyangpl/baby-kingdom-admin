import { getPrisma } from '../../shared/database.js';
import { NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';
import { encrypt, decrypt } from '../../shared/encryption.js';

function maskSecret(value: string): string {
  if (!value || value.length <= 4) return '••••••••';
  return '••••••••' + value.slice(-4);
}

export async function listByCategory(category: string | null) {
  const prisma = getPrisma();
  const where: Record<string, string> = {};
  if (category) where.category = category;
  const configs = await prisma.config.findMany({
    where,
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });
  return configs.map((c) => {
    const obj = { ...c };
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

export async function getValue(key: string): Promise<string | null> {
  const prisma = getPrisma();
  const config = await prisma.config.findUnique({ where: { key } });
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

export async function revealSecret(key: string, userId: string, ip: string): Promise<string> {
  const prisma = getPrisma();
  const config = await prisma.config.findUnique({ where: { key } });
  if (!config) throw new NotFoundError('Config');
  if (!config.isSecret) return config.value || '';

  let plainValue = '';
  try {
    plainValue = config.value ? decrypt(config.value) : '';
  } catch {
    plainValue = '';
  }

  await auditService.log({
    operator: userId, eventType: 'CONFIG_SECRET_VIEWED', module: 'config',
    targetId: key, actionDetail: `Viewed secret config ${key}`, ip,
  });

  return plainValue;
}

export async function updateValue(key: string, value: string, userId: string, ip: string) {
  const prisma = getPrisma();
  const config = await prisma.config.findUnique({ where: { key } });
  if (!config) throw new NotFoundError('Config');

  const beforeValue = config.isSecret ? '[SECRET]' : config.value;
  const afterValue = config.isSecret ? '[SECRET UPDATED]' : value;

  const newValue = config.isSecret ? encrypt(value) : value;
  const updated = await prisma.config.update({
    where: { key },
    data: { value: newValue, updatedBy: userId },
  });

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

  return updated;
}

export async function resetDefaults(userId: string, ip: string) {
  const prisma = getPrisma();
  const { CONFIG_PRESETS } = await import('../../seeds/config.seeds.js');
  for (const c of CONFIG_PRESETS) {
    const config = await prisma.config.findUnique({ where: { key: c.key } });
    if (config) {
      const newValue = c.isSecret && c.value ? encrypt(c.value) : (c.value || '');
      await prisma.config.update({
        where: { key: c.key },
        data: { value: newValue, updatedBy: userId },
      });
    }
  }
  await auditService.log({
    operator: userId, eventType: 'CONFIG_RESET', module: 'config',
    actionDetail: 'Reset all configs to defaults', ip,
  });
}

interface ConfigSeedItem {
  key: string;
  value?: string;
  category: string;
  description?: string;
  isSecret?: boolean;
}

export async function seed(configs: ConfigSeedItem[]) {
  const prisma = getPrisma();
  for (const c of configs) {
    const exists = await prisma.config.findUnique({ where: { key: c.key } });
    if (!exists) {
      const value = c.isSecret && c.value ? encrypt(c.value) : (c.value || '');
      await prisma.config.create({
        data: {
          key: c.key,
          value,
          category: c.category,
          description: c.description || '',
          isSecret: c.isSecret || false,
        },
      });
    }
  }
}
