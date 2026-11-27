import { timingSafeEqual } from 'node:crypto';
import type { Core } from '@strapi/strapi';

export default (policyContext: Core.PolicyContext): boolean => {
  const expected = process.env.STUDIO_TOKEN;
  if (!expected) return false;

  const header = policyContext.request.headers?.authorization ?? '';
  if (!header.startsWith('Bearer ')) return false;

  const provided = header.slice(7).trim();
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
};
