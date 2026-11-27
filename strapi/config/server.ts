import type { Core } from '@strapi/strapi';
export default ({ env }: Core.Config.Shared.ConfigParams) => ({ host: '127.0.0.1', port: env.int('PORT', 1337), app: { keys: env.array('APP_KEYS') }, mcp: { enabled: true } });
