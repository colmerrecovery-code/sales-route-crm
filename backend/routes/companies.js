import { Router } from 'express';
import * as c from '../controllers/companyController.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.get('/', c.list);
r.get('/stats', c.stats);
r.get('/:id', c.get);
r.post('/', validate(c.companySchema), c.create);
r.patch('/:id', validate(c.companyPatchSchema), c.update);
r.delete('/:id', c.remove);

r.post('/:id/clients', validate(c.clientSchema), c.createClient);
r.patch('/:id/clients/:clientId', validate(c.clientSchema.partial()), c.updateClient);
r.delete('/:id/clients/:clientId', c.removeClient);

r.post('/:id/interactions', validate(c.interactionSchema), c.createInteraction);
export default r;
