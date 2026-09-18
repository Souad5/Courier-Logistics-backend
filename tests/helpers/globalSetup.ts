import { PrismaClient } from "@prisma/client";

/**
 * Neon's dev branch can be suspended between sessions; the first connection
 * after a cold start can be refused while compute spins back up. Opening one
 * connection here — before any test file runs — absorbs that cold-start cost
 * up front instead of racing it against the first real test query.
 */
export async function setup(): Promise<void> {
  const prisma = new PrismaClient();
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$disconnect();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
