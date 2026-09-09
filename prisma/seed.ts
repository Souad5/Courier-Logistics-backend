import bcrypt from 'bcryptjs';
import {
  AuthProvider,
  ParcelStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

const PASSWORD = 'Password@123';

interface ISeedUser {
  email: string;
  name: string;
  phone: string;
  role: Role;
  isAvailable?: boolean;
}

interface ISeedHub {
  name: string;
  code: string;
  zoneCode: string;
  zoneName: string;
  address: string;
  city: string;
}

const USERS: ISeedUser[] = [
  { email: 'admin@courier.com', name: 'System Admin', phone: '+8801000000000', role: Role.ADMIN },
  { email: 'courier1@courier.com', name: 'Rahim Uddin', phone: '+8801000000001', role: Role.COURIER, isAvailable: true },
  { email: 'courier2@courier.com', name: 'Karim Hossain', phone: '+8801000000002', role: Role.COURIER },
  { email: 'customer1@courier.com', name: 'Alice Rahman', phone: '+8801000000003', role: Role.CUSTOMER },
  { email: 'customer2@courier.com', name: 'Bob Chowdhury', phone: '+8801000000004', role: Role.CUSTOMER },
];

const HUBS: ISeedHub[] = [
  { name: 'Gulshan Hub', code: 'HUB-GLS', zoneCode: 'inner-city', zoneName: 'Inner City', address: '12 Gulshan Avenue', city: 'Dhaka' },
  { name: 'Uttara Hub', code: 'HUB-UTR', zoneCode: 'city', zoneName: 'City', address: '45 Uttara Sector 7', city: 'Dhaka' },
  { name: 'Chattogram Hub', code: 'HUB-CTG', zoneCode: 'inter-city', zoneName: 'Inter City', address: '88 Agrabad C/A', city: 'Chattogram' },
];

// Pending parcel (unpaid), assigned-during-shipping parcel, in-transit, delivered, cancelled.
interface ISeedParcel {
  sender: string;
  courier?: string;
  origin: string;
  destination: string;
  status: ParcelStatus;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  weightKg: number;
  paid: boolean;
}

const PARCELS: Array<Omit<ISeedParcel, 'origin' | 'destination'> & { origin: string; destination: string }> = [
  {
    sender: 'customer1@courier.com',
    courier: 'courier1@courier.com',
    origin: 'HUB-GLS',
    destination: 'HUB-CTG',
    status: ParcelStatus.DELIVERED,
    receiverName: 'Carla Gomes',
    receiverPhone: '+8801711111111',
    receiverAddress: '22 Sheikh Mujib Road',
    receiverCity: 'Chattogram',
    weightKg: 1.5,
    paid: true,
  },
  {
    sender: 'customer1@courier.com',
    courier: 'courier1@courier.com',
    origin: 'HUB-GLS',
    destination: 'HUB-UTR',
    status: ParcelStatus.IN_TRANSIT,
    receiverName: 'David Ahmed',
    receiverPhone: '+8801711111112',
    receiverAddress: '10 House Building, Sector 5',
    receiverCity: 'Dhaka',
    weightKg: 3.2,
    paid: true,
  },
  {
    sender: 'customer2@courier.com',
    courier: 'courier2@courier.com',
    origin: 'HUB-UTR',
    destination: 'HUB-GLS',
    status: ParcelStatus.PICKED_UP,
    receiverName: 'Farah Khan',
    receiverPhone: '+8801711111113',
    receiverAddress: '7 Banani Road 11',
    receiverCity: 'Dhaka',
    weightKg: 0.8,
    paid: true,
  },
  {
    sender: 'customer2@courier.com',
    origin: 'HUB-UTR',
    destination: 'HUB-CTG',
    status: ParcelStatus.PENDING,
    receiverName: 'Golam Mostafa',
    receiverPhone: '+8801711111114',
    receiverAddress: '15 CDA Avenue',
    receiverCity: 'Chattogram',
    weightKg: 5,
    paid: false,
  },
  {
    sender: 'customer1@courier.com',
    origin: 'HUB-GLS',
    destination: 'HUB-UTR',
    status: ParcelStatus.CANCELLED,
    receiverName: 'Halim Mia',
    receiverPhone: '+8801711111115',
    receiverAddress: '3 Dhanmondi 27',
    receiverCity: 'Dhaka',
    weightKg: 2.1,
    paid: false,
  },
];

function feeFor(weightKg: number, originZone: string, destinationZone: string): number {
  const base = 60;
  const perKg = 25;
  const zoneFor = (zone: string): number => {
    const map: Record<string, number> = { 'inner-city': 0, city: 30, suburb: 50, outer: 70, 'inter-city': 100, remote: 150 };
    return map[zone] ?? 40;
  };
  return Math.round((base + weightKg * perKg + zoneFor(originZone) + zoneFor(destinationZone)) * 100) / 100;
}

function makeTrackingNumber(index: number): string {
  return `BCSEED${String(index).padStart(3, '0')}`;
}

async function main(tx: Prisma.TransactionClient): Promise<void> {
  const password = await bcrypt.hash(PASSWORD, 12);

  // Users
  const users: Record<string, string> = {};
  for (const u of USERS) {
    const user = await tx.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        phone: u.phone,
        password,
        role: u.role,
        provider: AuthProvider.LOCAL,
        isEmailVerified: true,
        isAvailable: u.isAvailable ?? false,
      },
    });
    users[u.email] = user.id;
  }

  // Hubs
  const hubs: Record<string, string> = {};
  for (const h of HUBS) {
    const hub = await tx.hub.upsert({
      where: { code: h.code },
      update: {},
      create: { ...h },
    });
    hubs[h.code] = hub.id;
  }

  // Declare parcel order: 5 sample parcels
  const parcelSeeds: Array<ISeedParcel & { origin: string; destination: string }> = [...PARCELS];

  for (let i = 0; i < parcelSeeds.length; i += 1) {
    const seed = parcelSeeds[i];
    const originHub = await tx.hub.findUniqueOrThrow({ where: { id: hubs[seed.origin] } });
    const destinationHub = await tx.hub.findUniqueOrThrow({ where: { id: hubs[seed.destination] } });

    const fee = feeFor(seed.weightKg, originHub.zoneCode, destinationHub.zoneCode);
    const deliveredAt = seed.status === ParcelStatus.DELIVERED ? new Date() : null;

    const parcel = await tx.parcel.create({
      data: {
        trackingNumber: makeTrackingNumber(i + 1),
        status: seed.status,
        weightKg: seed.weightKg,
        fee: new Prisma.Decimal(fee),
        senderId: users[seed.sender],
        courierId: seed.courier ? users[seed.courier] : null,
        originHubId: hubs[seed.origin],
        destinationHubId: hubs[seed.destination],
        senderName: seed.sender,
        senderPhone: USERS.find((u) => u.email === seed.sender)!.phone,
        senderAddress: '88 Dhanmondi Road 8',
        senderCity: 'Dhaka',
        receiverName: seed.receiverName,
        receiverPhone: seed.receiverPhone,
        receiverAddress: seed.receiverAddress,
        receiverCity: seed.receiverCity,
        deliveredAt,
        cancelledAt: seed.status === ParcelStatus.CANCELLED ? new Date() : null,
      },
    });

    await tx.parcelStatusHistory.create({
      data: {
        parcelId: parcel.id,
        status: ParcelStatus.PENDING,
        fromStatus: null,
        note: 'Parcel created (seed).',
      },
    });

    if (seed.status !== ParcelStatus.PENDING && seed.status !== ParcelStatus.CANCELLED) {
      await tx.parcelStatusHistory.create({
        data: {
          parcelId: parcel.id,
          status: seed.status,
          fromStatus: ParcelStatus.PENDING,
          note: `Seed set status to ${seed.status}.`,
        },
      });
    }

    if (seed.paid) {
      await tx.payment.create({
        data: {
          parcelId: parcel.id,
          senderId: users[seed.sender],
          amount: new Prisma.Decimal(fee),
          method: 'STRIPE',
          status: PaymentStatus.PAID,
          transactionId: `seed_txn_${i + 1}`,
          paidAt: new Date(),
        },
      });
    }
  }

  console.log('🌱 Seed summary:');
  console.log(`  Users: ${USERS.length} (1 admin, 2 couriers, 2 customers)`);
  console.log(`  Hubs: ${HUBS.length}`);
  console.log(`  Parcels: ${parcelSeeds.length}`);
}

async function run(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.auditLog.deleteMany();
      await tx.payment.deleteMany();
      await tx.parcelStatusHistory.deleteMany();
      await tx.parcel.deleteMany();
      await main(tx);
    },
    { maxWait: 30000, timeout: 120000 },
  );
}

run()
  .then(async () => {
    console.log('✅ Seeding complete.');
  })
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });