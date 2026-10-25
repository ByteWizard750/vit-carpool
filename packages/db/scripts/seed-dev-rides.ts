#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient, UserRole, VerificationStatus, VerificationMethod, Audience, RideStatus } from '../src';

// Load root .env
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && !process.env[key]) {
      process.env[key] = rest.join('=');
    }
  }
}

async function seedDevRides() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('[Seed] Connected to database.');

    // 1. Seed Verified Student Driver
    const studentEmail = 'arjun.driver@vitstudent.ac.in';
    let sDriver = await prisma.user.findUnique({ where: { email: studentEmail } });
    if (!sDriver) {
      sDriver = await prisma.user.create({
        data: {
          authUserId: crypto.randomUUID(),
          email: studentEmail,
          fullName: 'Arjun Verma (Student Driver)',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
      });
      console.log(`[Seed] Created student driver: ${sDriver.email}`);
    }

    // Vehicle for student driver
    let sVehicle = await prisma.vehicle.findFirst({
      where: { userId: sDriver.id, deletedAt: null },
    });
    if (!sVehicle) {
      sVehicle = await prisma.vehicle.create({
        data: {
          userId: sDriver.id,
          make: 'Hyundai',
          model: 'i20 Asta',
          color: 'Polar White',
          registrationNumber: 'TN19AA5001',
          capacity: 5,
        },
      });
      console.log(`[Seed] Created vehicle for student driver: ${sVehicle.make} ${sVehicle.model}`);
    }

    // Tomorrow morning 8:30 AM
    const tomorrowMorning = new Date();
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 30, 0, 0);

    // Tomorrow morning 9:15 AM
    const tomorrowMidMorning = new Date();
    tomorrowMidMorning.setDate(tomorrowMidMorning.getDate() + 1);
    tomorrowMidMorning.setHours(9, 15, 0, 0);

    // Tomorrow evening 5:00 PM
    const tomorrowEvening = new Date();
    tomorrowEvening.setDate(tomorrowEvening.getDate() + 1);
    tomorrowEvening.setHours(17, 0, 0, 0);

    // Student Ride 1: Tambaram -> VIT Chennai
    const existingR1 = await prisma.ride.findFirst({
      where: { driverId: sDriver.id, origin: 'Tambaram Railway Station' },
    });
    if (!existingR1) {
      await prisma.ride.create({
        data: {
          driverId: sDriver.id,
          vehicleId: sVehicle.id,
          audience: Audience.STUDENT,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus (Vandalur-Kelambakkam)',
          pickupDescription: 'Near East Tambaram Bus Terminus',
          dropoffDescription: 'Academic Block 1 Entrance',
          departureTime: tomorrowMorning,
          availableSeats: 3,
          costPerSeat: 50,
          status: RideStatus.SCHEDULED,
        },
      });
      console.log('[Seed] Created Student Ride 1: Tambaram -> VIT Chennai');
    }

    // Student Ride 2: Velachery -> VIT Chennai
    const existingR2 = await prisma.ride.findFirst({
      where: { driverId: sDriver.id, origin: 'Velachery MRTS / Phoenix Mall' },
    });
    if (!existingR2) {
      await prisma.ride.create({
        data: {
          driverId: sDriver.id,
          vehicleId: sVehicle.id,
          audience: Audience.STUDENT,
          origin: 'Velachery MRTS / Phoenix Mall',
          destination: 'VIT Chennai Campus (Vandalur-Kelambakkam)',
          pickupDescription: 'Opposite Velachery MRTS Station Main Gate',
          departureTime: tomorrowMidMorning,
          availableSeats: 2,
          costPerSeat: 60,
          status: RideStatus.SCHEDULED,
        },
      });
      console.log('[Seed] Created Student Ride 2: Velachery -> VIT Chennai');
    }

    // Student Ride 3: Sholinganallur -> VIT Chennai
    const existingR3 = await prisma.ride.findFirst({
      where: { driverId: sDriver.id, origin: 'Sholinganallur Junction (OMR)' },
    });
    if (!existingR3) {
      await prisma.ride.create({
        data: {
          driverId: sDriver.id,
          vehicleId: sVehicle.id,
          audience: Audience.STUDENT,
          origin: 'Sholinganallur Junction (OMR)',
          destination: 'VIT Chennai Campus (Vandalur-Kelambakkam)',
          pickupDescription: 'Near Dollar Signal / OMR Flyover',
          departureTime: tomorrowEvening,
          availableSeats: 3,
          costPerSeat: 45,
          status: RideStatus.SCHEDULED,
        },
      });
      console.log('[Seed] Created Student Ride 3: Sholinganallur -> VIT Chennai');
    }

    // 2. Seed Verified Faculty Driver
    const facultyEmail = 'dr.ramesh@vit.ac.in';
    let fDriver = await prisma.user.findUnique({ where: { email: facultyEmail } });
    if (!fDriver) {
      fDriver = await prisma.user.create({
        data: {
          authUserId: crypto.randomUUID(),
          email: facultyEmail,
          fullName: 'Dr. Ramesh Sundaram (Faculty Driver)',
          audience: Audience.FACULTY,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
      });
      console.log(`[Seed] Created faculty driver: ${fDriver.email}`);
    }

    // Vehicle for faculty driver
    let fVehicle = await prisma.vehicle.findFirst({
      where: { userId: fDriver.id, deletedAt: null },
    });
    if (!fVehicle) {
      fVehicle = await prisma.vehicle.create({
        data: {
          userId: fDriver.id,
          make: 'Honda',
          model: 'Amaze VX',
          color: 'Lunar Silver',
          registrationNumber: 'TN02BB6002',
          capacity: 4,
        },
      });
      console.log(`[Seed] Created vehicle for faculty driver: ${fVehicle.make} ${fVehicle.model}`);
    }

    // Faculty Ride: Adyar -> VIT Chennai Faculty Quarters
    const existingFRide = await prisma.ride.findFirst({
      where: { driverId: fDriver.id, origin: 'Adyar Bus Depot' },
    });
    if (!existingFRide) {
      await prisma.ride.create({
        data: {
          driverId: fDriver.id,
          vehicleId: fVehicle.id,
          audience: Audience.FACULTY,
          origin: 'Adyar Bus Depot',
          destination: 'VIT Chennai Faculty Quarters',
          pickupDescription: 'Depot Entrance Clock Tower',
          departureTime: tomorrowMorning,
          availableSeats: 2,
          costPerSeat: 40,
          status: RideStatus.SCHEDULED,
        },
      });
      console.log('[Seed] Created Faculty Ride: Adyar -> VIT Chennai');
    }

    console.log('[Seed] Completed seeding development database successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

seedDevRides().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
