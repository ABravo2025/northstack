import {
  authenticateToken,
  changeOwnPassword,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  sanitizeUser,
  updateOwnProfile,
  validatePasswordResetToken,
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

authRouter.post('/api/auth/forgot-password', async (req, res) => {
  if (isRateLimited(`forgot-password:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const email = req.body.email as string | undefined;
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email is required', field: 'email' });
  }

  await requestPasswordReset(email);
  // Deliberately identical whether or not the email matched an account —
  // see requestPasswordReset's own comment (enumeration).
  return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
});

authRouter.get('/api/auth/reset-password/:token', async (req, res) => {
  const result = await validatePasswordResetToken(req.params.token);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ valid: true });
});

authRouter.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  const result = await resetPassword(token, password);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
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
