import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { buildCrud } from '../../shared/crud.js';
import { encrypt, isEncrypted } from '../../shared/encryption.js';
import { getPrisma } from '../../shared/database.js';
import { success, created } from '../../shared/response.js';
import { NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';

const ALLOWED_FIELDS = [
  'accountId', 'username', 'archetype', 'primaryToneMode', 'secondaryToneMode',
  'avoidedToneMode', 'voiceCues', 'catchphrases', 'topicBlacklist', 'tier3Script',
  'maxPostsPerDay', 'bkPassword', 'bkUid', 'overrideNotes', 'isActive',
];

const MASKED_FIELDS = ['bkPassword', 'bkToken'];

/** Mask sensitive fields in persona response */
function maskPersona(persona: Record<string, any>) {
  const obj = { ...persona };
  for (const field of MASKED_FIELDS) {
    if (obj[field]) obj[field] = '••••••••';
  }
  return obj;
}

/** Encrypt bkPassword if present and not already encrypted */
function encryptPasswordIfNeeded(data: Record<string, any>) {
  if (data.bkPassword && !isEncrypted(data.bkPassword)) {
    data.bkPassword = encrypt(data.bkPassword);
  }
  return data;
}

/** Filter body to only allowed fields */
function filterBody(body: Record<string, any>) {
  const filtered: Record<string, any> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) filtered[key] = body[key];
  }
  return filtered;
}

const baseCrud = buildCrud('persona', 'persona', {
  lookupField: 'accountId',
  allowedFields: ALLOWED_FIELDS,
});

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// List — mask sensitive fields
router.get('/', authenticate, wrap(async (req, res) => {
  const prisma = getPrisma();
  const { page = 1, limit = 50, ...filters } = req.query;
  const p = parseInt(page as string);
  const l = Math.min(parseInt(limit as string) || 50, 200);
  const skip = (p - 1) * l;

  const where: Record<string, any> = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive === 'true';
  if (filters.archetype) where.archetype = filters.archetype;

  const [data, total] = await Promise.all([
    prisma.persona.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: l }),
    prisma.persona.count({ where }),
  ]);

  return res.json({
    success: true,
    data: data.map(maskPersona),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  });
}));

// GetById — mask sensitive fields
router.get('/:id', authenticate, wrap(async (req, res) => {
  const prisma = getPrisma();
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let persona;
  if (uuidRegex.test(id)) {
    persona = await prisma.persona.findUnique({ where: { id } });
  }
  if (!persona) {
    persona = await prisma.persona.findFirst({ where: { accountId: id } });
  }
  if (!persona) throw new NotFoundError('Persona');
  return success(res, maskPersona(persona));
}));

// Create — encrypt bkPassword before save
router.post('/', authenticate, authorize('admin'), wrap(async (req, res) => {
  const prisma = getPrisma();
  const data = encryptPasswordIfNeeded(filterBody(req.body));
  const persona = await prisma.persona.create({ data: data as any });

  await auditService.log({
    operator: req.user?.id || 'system',
    eventType: 'PERSONA_CREATED',
    module: 'persona',
    targetId: persona.id,
    actionDetail: `Created persona: ${persona.accountId}`,
    after: maskPersona(persona),
    ip: req.ip,
  });

  return created(res, maskPersona(persona));
}));

// Update — encrypt bkPassword before save
router.put('/:id', authenticate, authorize('admin'), wrap(async (req, res) => {
  const prisma = getPrisma();
  const id = req.params.id as string;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let persona;
  if (uuidRegex.test(id)) {
    persona = await prisma.persona.findUnique({ where: { id } });
  }
  if (!persona) {
    persona = await prisma.persona.findFirst({ where: { accountId: id } });
  }
  if (!persona) throw new NotFoundError('Persona');

  const before = maskPersona(persona);
  const data = encryptPasswordIfNeeded(filterBody(req.body));
  const updated = await prisma.persona.update({ where: { id: persona.id }, data });

  await auditService.log({
    operator: req.user?.id || 'system',
    eventType: 'PERSONA_UPDATED',
    module: 'persona',
    targetId: persona.id,
    actionDetail: `Updated persona: ${persona.accountId}`,
    before,
    after: maskPersona(updated),
    ip: req.ip,
  });

  return success(res, maskPersona(updated));
}));

// Delete — use baseCrud
router.delete('/:id', authenticate, authorize('admin'), wrap(baseCrud.remove));

export default router;
