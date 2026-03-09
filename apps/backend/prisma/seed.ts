import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ZONES = [
  {
    name: 'North',
    nameHe: 'צפון',
    cities: ['חיפה', 'נצרת', 'עכו', 'כרמיאל', 'צפת', 'טבריה', 'עפולה', 'נהריה', 'קריית שמונה', 'מגדל העמק', 'יקנעם'],
  },
  {
    name: 'Haifa',
    nameHe: 'חיפה והקריות',
    cities: ['קריית אתא', 'קריית ביאליק', 'קריית מוצקין', 'קריית ים', 'נשר', 'טירת כרמל'],
  },
  {
    name: 'Sharon',
    nameHe: 'שרון',
    cities: ['נתניה', 'רעננה', 'כפר סבא', 'הוד השרון', 'רמת השרון', 'חדרה', 'אור עקיבא', 'זכרון יעקב', 'פרדס חנה-כרכור'],
  },
  {
    name: 'Center',
    nameHe: 'מרכז',
    cities: ['תל אביב', 'רמת גן', 'גבעתיים', 'בני ברק', 'פתח תקווה', 'ראשון לציון', 'חולון', 'בת ים', 'הרצליה', 'רמלה', 'לוד', 'יהוד', 'אור יהודה', 'קריית אונו'],
  },
  {
    name: 'Jerusalem',
    nameHe: 'ירושלים',
    cities: ['ירושלים', 'בית שמש', 'מעלה אדומים', 'מודיעין', 'מודיעין עילית', 'ביתר עילית', 'גבעת זאב', 'מבשרת ציון'],
  },
  {
    name: 'South',
    nameHe: 'דרום',
    cities: ['באר שבע', 'אשדוד', 'אשקלון', 'קריית גת', 'שדרות', 'נתיבות', 'אופקים', 'ערד', 'דימונה', 'אילת'],
  },
  {
    name: 'Lowlands',
    nameHe: 'שפלה',
    cities: ['רחובות', 'נס ציונה', 'יבנה', 'גדרה', 'קריית מלאכי', 'מזכרת בתיה', 'באר יעקב'],
  },
];

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@delivery.local' },
    update: {},
    create: {
      email: 'admin@delivery.local',
      passwordHash: adminPassword,
      fullName: 'מנהל מערכת',
      role: 'ADMIN',
      phone: '050-0000000',
    },
  });

  // Create coordinator user
  const coordPassword = await bcrypt.hash('coord123', 10);
  await prisma.user.upsert({
    where: { email: 'coordinator@delivery.local' },
    update: {},
    create: {
      email: 'coordinator@delivery.local',
      passwordHash: coordPassword,
      fullName: 'מתאמת ראשית',
      role: 'COORDINATOR',
      phone: '050-1111111',
    },
  });

  // Create driver user
  const driverPassword = await bcrypt.hash('driver123', 10);
  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@delivery.local' },
    update: {},
    create: {
      email: 'driver@delivery.local',
      passwordHash: driverPassword,
      fullName: 'נהג ראשי',
      role: 'DRIVER',
      phone: '050-2222222',
    },
  });

  // Create driver profile
  await prisma.driverProfile.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: {
      userId: driverUser.id,
      licenseType: 'C',
    },
  });

  // Create zones with cities
  for (const zoneData of DEFAULT_ZONES) {
    const zone = await prisma.zone.upsert({
      where: { name: zoneData.name },
      update: { nameHe: zoneData.nameHe },
      create: {
        name: zoneData.name,
        nameHe: zoneData.nameHe,
      },
    });

    for (const city of zoneData.cities) {
      await prisma.zoneCity.upsert({
        where: { zoneId_city: { zoneId: zone.id, city } },
        update: {},
        create: { zoneId: zone.id, city },
      });
    }
  }

  // Create sample trucks
  const trucks = [
    { name: 'משאית-01', licensePlate: '11-222-33', size: 'LARGE' as const, hasCrane: true, maxWeightKg: 12000, maxPallets: 20, workHoursPerDay: 10, waitTimePerStop: 20 },
    { name: 'משאית-02', licensePlate: '44-555-66', size: 'LARGE' as const, hasCrane: false, maxWeightKg: 10000, maxPallets: 16, workHoursPerDay: 10, waitTimePerStop: 15 },
    { name: 'משאית-03', licensePlate: '77-888-99', size: 'SMALL' as const, hasCrane: false, maxWeightKg: 5000, maxPallets: 8, workHoursPerDay: 8, waitTimePerStop: 10 },
  ];

  for (const truck of trucks) {
    await prisma.truck.upsert({
      where: { name: truck.name },
      update: {},
      create: truck,
    });
  }

  // Assign driver to truck-01 for today
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUser.id },
  });
  const truck01 = await prisma.truck.findUnique({ where: { name: 'משאית-01' } });

  if (driverProfile && truck01) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.truckAssignment.upsert({
      where: {
        truckId_assignmentDate: {
          truckId: truck01.id,
          assignmentDate: today,
        },
      },
      update: {},
      create: {
        truckId: truck01.id,
        driverProfileId: driverProfile.id,
        assignmentDate: today,
        isActive: true,
      },
    });
    console.log('  Driver assigned to משאית-01 for today');
  }

  console.log('Seed completed successfully!');
  console.log('Users:');
  console.log('  admin@delivery.local / admin123');
  console.log('  coordinator@delivery.local / coord123');
  console.log('  driver@delivery.local / driver123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
