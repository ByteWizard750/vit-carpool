import { PrismaClient } from '../prisma/client';

export * from '../prisma/client';

export const createPrismaClient = (databaseUrl?: string) => {
  return new PrismaClient({
    datasources: databaseUrl
      ? {
          db: {
            url: databaseUrl,
          },
        }
      : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
};

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
