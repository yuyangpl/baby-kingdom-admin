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

// Batch verify all active personas' BK Forum login
router.post('/verify-all', authenticate, authorize('admin'), wrap(async (req, res) => {
  const prisma = getPrisma();
  const { decrypt } = await import('../../shared/encryption.js');
  const configService = await import('../config/config.service.js');
  const baseUrl = await configService.getValue('BK_BASE_URL') || 'https://bapi.baby-kingdom.com/index.php';
  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  const personas = await prisma.persona.findMany({
    where: { isActive: true },
    orderBy: { accountId: 'asc' },
  });

  type VerifyResult = { accountId: string; username: string; status: 'ok' | 'fail' | 'no_password'; uid?: number; error?: string };

  async function verifyOne(p: typeof personas[number]): Promise<VerifyResult> {
    if (!p.bkPassword) return { accountId: p.accountId, username: p.username, status: 'no_password' };

    let password: string;
    try {
      password = decrypt(p.bkPassword);
    } catch {
      return { accountId: p.accountId, username: p.username, status: 'fail', error: 'decrypt failed' };
    }

    try {
      const qs = new URLSearchParams({ mod: 'member', op: 'login', app: bkApp, ver: bkVer });
      const resp = await fetch(`${baseUrl}?${qs.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: p.username, password }).toString(),
        signal: AbortSignal.timeout(15000),
      });
      const body = await resp.json() as any;

      if (body.status === 1 && body.data?.token) {
        await prisma.persona.update({
          where: { id: p.id },
          data: {
            bkToken: body.data.token,
            bkUid: body.data.uid ? parseInt(String(body.data.uid), 10) : p.bkUid,
            bkTokenExpiry: new Date(Date.now() + 24 * 3600 * 1000),
            tokenStatus: 'active',
          },
        });
        return { accountId: p.accountId, username: p.username, status: 'ok', uid: body.data.uid };
      }
      return { accountId: p.accountId, username: p.username, status: 'fail', error: body.message || 'login failed' };
    } catch (err: any) {
      return { accountId: p.accountId, username: p.username, status: 'fail', error: err.message };
    }
  }

  // 5 concurrent batches
  const results: VerifyResult[] = [];
  const BATCH = 5;
  for (let i = 0; i < personas.length; i += BATCH) {
    const batch = personas.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(verifyOne));
    results.push(...batchResults);
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const noPassword = results.filter(r => r.status === 'no_password').length;

  await auditService.log({
    operator: (req as any).user?.id || 'system',
    eventType: 'PERSONA_VERIFY_ALL',
    module: 'persona',
    actionDetail: `Batch verify: ${ok} ok, ${fail} fail, ${noPassword} no password`,
    ip: req.ip || '',
  });

  return success(res, { total: results.length, ok, fail, noPassword, results });
}));

// Verify BK Forum login with username + password
router.post('/verify-bk-login', authenticate, authorize('admin', 'approver'), wrap(async (req, res) => {
  const { username, password } = req.body;
  const { BusinessError } = await import('../../shared/errors.js');
  if (!username || !password) throw new BusinessError('Username and password required');

  const configService = await import('../config/config.service.js');
  const baseUrl = await configService.getValue('BK_BASE_URL') || 'https://bapi.baby-kingdom.com/index.php';
  const bkApp = await configService.getValue('BK_APP') || 'android';
  const bkVer = await configService.getValue('BK_VER') || '3.11.11';

  const qs = new URLSearchParams({ mod: 'member', op: 'login', app: bkApp, ver: bkVer });
  const url = `${baseUrl}?${qs.toString()}`;
  const formData = new URLSearchParams({ username, password });

  const res2 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res2.json() as any;

  if (body.status !== 1 || !body.data?.token) {
    throw new BusinessError(`BK 登入失敗: ${body.message || '帳號或密碼錯誤'}`);
  }

  return success(res, { verified: true, uid: body.data.uid, username });
}));

// Create — encrypt bkPassword before save
router.post('/', authenticate, authorize('admin', 'approver'), wrap(async (req, res) => {
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
router.put('/:id', authenticate, authorize('admin', 'approver'), wrap(async (req, res) => {
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
router.delete('/:id', authenticate, authorize('admin', 'approver'), wrap(baseCrud.remove));

export default router;
