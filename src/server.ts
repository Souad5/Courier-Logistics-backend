import { app } from "./app";
import { env, prisma } from "./config";

const CONNECT_RETRIES = 5;
const CONNECT_RETRY_DELAY_MS = 2_000;

async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      if (attempt >= CONNECT_RETRIES) throw error;
      console.warn(
        `⚠️  Database connection attempt ${attempt} failed, retrying in ${CONNECT_RETRY_DELAY_MS}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
    }
  }
}

async function bootstrap(): Promise<void> {
  try {
    await connectWithRetry();
    console.log("✅ Database connected");

    const HOST = "0.0.0.0";
    const server = app.listen(env.PORT, HOST, () => {
      console.log(
        `🚀 Courier & Logistics API running on http://localhost:${env.PORT} || http://192.168.0.80:${env.PORT}`,
      );
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      server.close(() => void prisma.$disconnect());
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
