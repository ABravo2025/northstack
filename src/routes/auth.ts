import {
  authenticateToken,
  changeOwnPassword,
  loginUser,
  logoutUser,
  registerUser,
  sanitizeUser,
  updateOwnProfile,
} from '../modules/auth/authService.js';
import { AUTH_RATE_LIMIT, isRateLimited } from '../lib/rateLimit.js';
import { authenticateUser, getBearerToken, getClientIp } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const authRouter = createAsyncRouter();

authRouter.post('/api/auth/register', async (req, res) => {
  if (isRateLimited(`register:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const result = await registerUser(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(201).json({ user: sanitizeUser(result.user!), session: result.session });
});

authRouter.post('/api/auth/login', async (req, res) => {
  if (isRateLimited(`login:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const result = await loginUser(req.body);

  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  return res.json({ user: sanitizeUser(result.user!), session: result.session });
});

authRouter.post('/api/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const success = await logoutUser(token);
  if (!success) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  return res.status(204).end();
});

authRouter.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await authenticateToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return res.json({ user: sanitizeUser(user) });
});

authRouter.patch('/api/users/me', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await updateOwnProfile(user.id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.json({ user: sanitizeUser(result.user!) });
});

authRouter.patch('/api/users/me/password', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await changeOwnPassword(user.id, req.body, getBearerToken(req)!);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(204).end();
});
