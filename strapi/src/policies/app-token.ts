import { timingSafeEqual } from 'node:crypto';
// Content API access for Next.js only. MCP uses Strapi's own Admin-token authentication.
export default (ctx: {request: {header: Record<string,string | undefined>}}) => {
  const expected=process.env.STUDIO_TOKEN;
  const supplied=ctx.request.header.authorization?.replace(/^Bearer /,'');
  if(!expected || !supplied) return false;
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return a.length===b.length && timingSafeEqual(a,b);
};
