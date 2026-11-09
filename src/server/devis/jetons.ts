import { createHash, randomBytes } from 'node:crypto';

export type JetonSuivi = {
  token: string;
  hash: string;
};

export function creerJetonSuivi(): JetonSuivi {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashJeton(token) };
}

export function hashJeton(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function referenceDevis(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DEV-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
