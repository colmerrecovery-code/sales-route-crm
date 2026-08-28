import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.post('/register', validate(c.registerSchema), c.register);
r.post('/login', validate(c.loginSchema), c.login);
r.get('/me', requireAuth, c.me);
r.put('/me/home', requireAuth, c.setHome);
export default r;
