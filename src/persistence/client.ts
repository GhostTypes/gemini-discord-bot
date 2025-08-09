/**
 * @fileoverview Prisma client singleton for database operations
 * 
 * Provides a single instance of PrismaClient for the Discord bot message cache system.
 * Includes proper connection handling and graceful shutdown logic.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma || 
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Note: Event logging would go here if configured with emit: 'event'

// Graceful shutdown handling
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});