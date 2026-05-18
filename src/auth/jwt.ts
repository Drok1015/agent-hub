import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';

export interface JWTPayload {
  agentId: string;
  name: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: JWTPayload, secret: string, expiresIn: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setIssuer('agent-hub')
    .sign(key);
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload> {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  
  const { payload } = await jwtVerify(token, key, {
    issuer: 'agent-hub',
  });
  
  return payload as JWTPayload;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
