import { getSessionUser, type ServerUser } from '@/server/db';

export function getRequestUser(request: Request): ServerUser | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token ? getSessionUser(token) : null;
}
