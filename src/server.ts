import { app } from "./app";
import { env, prisma } from "./config";

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Courier & Logistics API running on http://localhost:${env.PORT}`);
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
