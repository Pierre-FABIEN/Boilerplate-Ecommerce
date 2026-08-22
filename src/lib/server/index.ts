import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// Le rechargement à chaud de Vite réévalue ce module : sans ce cache global,
// chaque itération ouvrirait un nouveau pool de connexions PostgreSQL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: dev ? ['warn', 'error'] : ['error']
	});

if (dev) {
	globalForPrisma.prisma = prisma;
}
