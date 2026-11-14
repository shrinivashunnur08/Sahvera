import { createRemoteJWKSet, jwtVerify } from 'jose';
import fs from 'node:fs';
import path from 'node:path';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

let cachedProjectId: string | null = null;

export function getConfiguredFirebaseProjectId(): string | null {
  if (cachedProjectId) return cachedProjectId;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
    if (raw.projectId && raw.projectId !== 'remixed-project-id') {
      cachedProjectId = raw.projectId;
      return cachedProjectId;
    }
  } catch {
    return null;
  }
  return null;
}

export async function verifyBearerToken(
  authHeader: string | undefined
): Promise<{ ok: true; user: VerifiedFirebaseUser } | { ok: false; status: number; error: string }> {
  const projectId = getConfiguredFirebaseProjectId();
  if (!projectId) {
    return { ok: false, status: 503, error: 'Firebase project is not configured on server.' };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Bearer authentication token.' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Empty authentication token.' };
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const emailVerified = payload.email_verified === true;

    if (!uid || !emailVerified) {
      return {
        ok: false,
        status: 403,
        error: 'Verified email authentication is required for private organization access.',
      };
    }

    return {
      ok: true,
      user: { uid, email, emailVerified },
    };
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired authentication token.' };
  }
}

export function assertTenantBoundary(params: {
  authenticatedUid: string;
  requestedOwnerUid: string;
  requestedOrgId: string;
  expectedOrgId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!params.authenticatedUid) {
    return { ok: false, reason: 'Unauthenticated request.' };
  }
  if (params.authenticatedUid !== params.requestedOwnerUid) {
    return {
      ok: false,
      reason: 'Cross-tenant access denied: authenticated user does not own target record.',
    };
  }
  if (!params.requestedOrgId || params.requestedOrgId !== params.expectedOrgId) {
    return {
      ok: false,
      reason: 'Cross-organization boundary mismatch rejected.',
    };
  }
  return { ok: true };
}
