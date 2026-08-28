import { Router } from 'express';
import * as c from '../controllers/tripController.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.get('/', c.list);
r.get('/:id', c.get);
r.post('/', validate(c.tripSchema), c.create);
r.patch('/:id', validate(c.tripPatchSchema), c.update);
r.delete('/:id', c.remove);

r.post('/:id/stops', validate(c.addStopsSchema), c.addStops);
r.patch('/:id/stops/:stopId', validate(c.stopPatchSchema), c.updateStop);
r.delete('/:id/stops/:stopId', c.removeStop);

r.post('/:id/breaks', validate(c.breakSchema), c.addBreak);
r.delete('/:id/breaks/:breakId', c.removeBreak);

r.post('/:id/optimize', c.optimize);
r.get('/:id/directions', c.getDirections);
export default r;
