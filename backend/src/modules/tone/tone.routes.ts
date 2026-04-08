import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { buildCrud } from '../../shared/crud.js';
import ToneMode from './tone.model.js';

const router = Router();
const ctrl = buildCrud(ToneMode, 'tone', {
  lookupField: 'toneId',
  allowedFields: [
    'toneId', 'displayName', 'whenToUse', 'emotionalRegister', 'openingStyle',
    'sentenceStructure', 'whatToAvoid', 'exampleOpening', 'suitableForTier3',
    'overridePriority', 'isActive',
  ],
});
const wrap = (fn: Function) => (req: any, res: any, next: any) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.list));
router.get('/:id', authenticate, wrap(ctrl.getById));
router.post('/', authenticate, authorize('admin'), wrap(ctrl.create));
router.put('/:id', authenticate, authorize('admin'), wrap(ctrl.update));
router.delete('/:id', authenticate, authorize('admin'), wrap(ctrl.remove));

export default router;
