import { factories } from '@strapi/strapi';

const studioAccess = {
  auth: false as const,
  policies: ['global::studio-token'],
};

export default factories.createCoreRouter('api::learning-note.learning-note' as never, {
  config: {
    find: studioAccess,
    findOne: studioAccess,
    create: studioAccess,
    update: studioAccess,
    delete: studioAccess,
  },
});
