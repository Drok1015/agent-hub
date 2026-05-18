import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload, verifyToken } from './jwt';
import { errors, createError } from '../utils/errors';
import { Config } from '../config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  config: Config
) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    throw createError(errors.MISSING_TOKEN);
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw createError(errors.INVALID_TOKEN);
  }
  
  const token = parts[1];
  
  try {
    const payload = await verifyToken(token, config.jwtSecret);
    request.user = payload;
  } catch (error) {
    throw createError(errors.INVALID_TOKEN);
  }
}
