import { app } from '../src/app';
import { prisma } from '../src/config';

let dbConnected = false;

// Warmup: connect to database on first request
app.use(async (_req, _res, next) => {
  if (!dbConnected) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (err) {
      console.error('Database connection failed:', err);
      dbConnected = false;
    }
  }
  next();
});

export default app;
