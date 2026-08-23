import { randomBytes } from 'node:crypto';
import { google, calendar_v3, Auth } from 'googleapis';
import prisma from '../../lib/prisma.js';
import { decryptGoogleToken, encryptGoogleToken, isGoogleTokenEncryptionConfigured } from '../../lib/googleTokenEncryption.js';

// event CRUD only — no calendar-settings/list access, the minimal scope for
// one-way Task/TimeOff -> Google Calendar sync.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function googleCalendarConfigured(): boolean {
  if (
    !process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    !process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    !isGoogleTokenEncryptionConfigured()
  ) {
    console.warn(
      'Google Calendar sync skipped: GOOGLE_CALENDAR_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI/GOOGLE_TOKEN_ENCRYPTION_KEY not fully configured',
    );
    return false;
  }
  return true;
}

function buildOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );
}

// Starts the connect flow: persists a single-use state row (identity for the
// stateless /callback hit — see GoogleOAuthState's schema comment) and
// returns the Google consent URL to redirect the browser to.
export async function buildGoogleAuthUrl(userId: string, tenantId: string): Promise<string> {
  const state = randomBytes(32).toString('hex');
  await prisma.googleOAuthState.create({ data: { state, userId, tenantId } });

  const client = buildOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    // Always show the consent screen so a *reconnect* also yields a fresh
    // refresh_token — Google only issues one on the first-ever grant otherwise.
    prompt: 'consent',
    scope: [CALENDAR_SCOPE],
    state,
  });
}

export interface OAuthCallbackResult {
  success: boolean;
  error?: string;
}

// Verifies `state` against the DB (proves this callback belongs to the user
// who started the /connect redirect — there's no session cookie/bearer token
// available on this browser-initiated hit), exchanges `code` for tokens, and
// upserts the connection.
export async function handleGoogleOAuthCallback(code: string, state: string): Promise<OAuthCallbackResult> {
  const stateRow = await prisma.googleOAuthState.findUnique({ where: { state } });
  if (stateRow) {
    await prisma.googleOAuthState.delete({ where: { state } }).catch(() => {});
  }
  if (!stateRow || Date.now() - stateRow.createdAt.getTime() > OAUTH_STATE_MAX_AGE_MS) {
    return { success: false, error: 'This connection link has expired. Please try connecting again.' };
  }

  const client = buildOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    return { success: false, error: 'Google did not grant offline access. Please try again.' };
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: 'v2' });
  const { data: userInfo } = await oauth2.userinfo.get();
  if (!userInfo.email) {
    return { success: false, error: 'Could not read the connected Google account email.' };
  }

  await prisma.googleCalendarConnection.upsert({
    where: { userId: stateRow.userId },
    create: {
      tenantId: stateRow.tenantId,
      userId: stateRow.userId,
      googleAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptGoogleToken(tokens.access_token),
      refreshTokenEncrypted: encryptGoogleToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(tokens.expiry_date ?? Date.now()),
      scope: tokens.scope ?? CALENDAR_SCOPE,
    },
    update: {
      googleAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptGoogleToken(tokens.access_token),
      refreshTokenEncrypted: encryptGoogleToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(tokens.expiry_date ?? Date.now()),
      scope: tokens.scope ?? CALENDAR_SCOPE,
      needsReconnect: false,
    },
  });

  return { success: true };
}

export interface GoogleCalendarConnectionStatus {
  connected: boolean;
  googleAccountEmail: string | null;
  needsReconnect: boolean;
}

export async function getGoogleCalendarConnectionStatus(userId: string): Promise<GoogleCalendarConnectionStatus> {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) {
    return { connected: false, googleAccountEmail: null, needsReconnect: false };
  }
  return { connected: true, googleAccountEmail: connection.googleAccountEmail, needsReconnect: connection.needsReconnect };
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) return;

  try {
    const client = buildOAuth2Client();
    await client.revokeToken(decryptGoogleToken(connection.refreshTokenEncrypted));
  } catch (err) {
    // Best-effort — the token may already be invalid/revoked on Google's side;
    // either way, forgetting our own copy below is what actually matters.
    console.error('Failed to revoke Google Calendar token (continuing to disconnect locally):', err);
  }

  await prisma.googleCalendarConnection.delete({ where: { userId } });
}

// Returns null (silent no-op for callers) if the user never connected or
// needs to reconnect — every sync call site treats that as "nothing to do,"
// mirroring how mailerConfigured() gates best-effort email sends.
export async function getAuthorizedClientForUser(userId: string): Promise<calendar_v3.Calendar | null> {
  if (!googleCalendarConfigured()) return null;

  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection || connection.needsReconnect) return null;

  const client = buildOAuth2Client();
  client.setCredentials({
    access_token: decryptGoogleToken(connection.accessTokenEncrypted),
    refresh_token: decryptGoogleToken(connection.refreshTokenEncrypted),
    expiry_date: connection.accessTokenExpiresAt.getTime(),
  });

  // google-auth-library fires this whenever it silently refreshes the access
  // token mid-request — persist the refreshed token so the next call doesn't
  // have to round-trip through Google's token endpoint again.
  client.on('tokens', (tokens) => {
    const data: { accessTokenEncrypted?: string; accessTokenExpiresAt?: Date; refreshTokenEncrypted?: string } = {};
    if (tokens.access_token) data.accessTokenEncrypted = encryptGoogleToken(tokens.access_token);
    if (tokens.expiry_date) data.accessTokenExpiresAt = new Date(tokens.expiry_date);
    if (tokens.refresh_token) data.refreshTokenEncrypted = encryptGoogleToken(tokens.refresh_token);
    if (Object.keys(data).length === 0) return;
    prisma.googleCalendarConnection
      .update({ where: { userId }, data })
      .catch((err) => console.error('Failed to persist refreshed Google Calendar token:', err));
  });

  return google.calendar({ version: 'v3', auth: client });
}

// Google surfaces a revoked/expired refresh token as invalid_grant. Callers
// funnel their catch blocks through this so a sync failure due to revocation
// flips the connection to "needs reconnect" instead of just logging forever.
export async function markNeedsReconnectIfRevoked(userId: string, err: unknown): Promise<void> {
  const gaxiosError = err as { response?: { data?: { error?: string } }; code?: string } | undefined;
  const errorCode = gaxiosError?.response?.data?.error ?? gaxiosError?.code;
  if (errorCode !== 'invalid_grant') return;

  await prisma.googleCalendarConnection
    .update({ where: { userId }, data: { needsReconnect: true } })
    .catch((updateErr) => console.error('Failed to mark Google Calendar connection as needing reconnect:', updateErr));
}
