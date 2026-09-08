import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

const PORT = env.PORT;

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Courier & Logistics API listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
