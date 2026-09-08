import { PrismaClient, Role, AuthProvider, ShipmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  const password = await bcrypt.hash('Password@123', 12);

  // Admin demo account
  const admin = await prisma.user.upsert({
    where: { email: 'admin@courier.com' },
    update: {},
    create: {
      email: 'admin@courier.com',
      name: 'System Admin',
      password,
      role: Role.ADMIN,
      provider: AuthProvider.EMAIL,
      isEmailVerified: true,
    },
  });
  console.log('✅ Admin:', admin.email);

  // Customer demo account
  const customer = await prisma.user.upsert({
    where: { email: 'customer@courier.com' },
    update: {},
    create: {
      email: 'customer@courier.com',
      name: 'Alice Customer',
      phone: '+8801000000001',
      password,
      role: Role.CUSTOMER,
      provider: AuthProvider.EMAIL,
      isEmailVerified: true,
    },
  });
  console.log('✅ Customer:', customer.email);

  // Courier demo account + profile
  const courierUser = await prisma.user.upsert({
    where: { email: 'courier@courier.com' },
    update: {},
    create: {
      email: 'courier@courier.com',
      name: 'Bob Courier',
      phone: '+8801000000002',
      password,
      role: Role.COURIER,
      provider: AuthProvider.EMAIL,
      isEmailVerified: true,
    },
  });

  await prisma.courierProfile.upsert({
    where: { userId: courierUser.id },
    update: {},
    create: {
      userId: courierUser.id,
      vehicleType: 'Motorcycle',
      licenseNumber: 'DL-12345',
      isAvailable: true,
      rating: 4.8,
      totalDeliveries: 120,
    },
  });
  console.log('✅ Courier:', courierUser.email);

  console.log('🌱 Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
