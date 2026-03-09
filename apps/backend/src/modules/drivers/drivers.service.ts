import bcrypt from 'bcryptjs';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class DriversService {
  async getAll() {
    return prisma.driverProfile.findMany({
      include: {
        user: {
          select: { id: true, fullName: true, phone: true, email: true, isActive: true, department: true },
        },
        truckAssignment: {
          where: { isActive: true },
          include: { truck: { select: { id: true, name: true, licensePlate: true } } },
          orderBy: { assignmentDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
  }

  async create(data: {
    email: string; password: string; fullName: string; phone?: string;
    licenseType: string; truckId?: number; department?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError(400, 'EMAIL_EXISTS', 'כתובת אימייל כבר קיימת במערכת');

    return prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(data.password, 12);
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          fullName: data.fullName,
          role: 'DRIVER',
          phone: data.phone || null,
          department: data.department as any || null,
        },
      });

      const profile = await tx.driverProfile.create({
        data: {
          userId: user.id,
          licenseType: data.licenseType,
        },
      });

      if (data.truckId) {
        await tx.truckAssignment.create({
          data: {
            truckId: data.truckId,
            driverProfileId: profile.id,
            assignmentDate: new Date(),
            isActive: true,
          },
        });
      }

      return profile;
    });
  }

  async update(profileId: number, data: {
    fullName?: string; phone?: string; licenseType?: string;
    truckId?: number | null; department?: string | null; isActive?: boolean;
  }) {
    const profile = await prisma.driverProfile.findUnique({
      where: { id: profileId },
      include: { user: true },
    });
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'נהג לא נמצא');

    return prisma.$transaction(async (tx) => {
      // Update user fields
      const userUpdate: any = {};
      if (data.fullName !== undefined) userUpdate.fullName = data.fullName;
      if (data.phone !== undefined) userUpdate.phone = data.phone;
      if (data.isActive !== undefined) userUpdate.isActive = data.isActive;
      if ('department' in data) userUpdate.department = data.department as any || null;

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: profile.userId }, data: userUpdate });
      }

      // Update profile fields
      if (data.licenseType) {
        await tx.driverProfile.update({
          where: { id: profileId },
          data: { licenseType: data.licenseType },
        });
      }

      // Update truck assignment
      if ('truckId' in data) {
        // Deactivate current assignments
        await tx.truckAssignment.updateMany({
          where: { driverProfileId: profileId, isActive: true },
          data: { isActive: false },
        });

        if (data.truckId) {
          await tx.truckAssignment.create({
            data: {
              truckId: data.truckId,
              driverProfileId: profileId,
              assignmentDate: new Date(),
              isActive: true,
            },
          });
        }
      }

      return tx.driverProfile.findUnique({
        where: { id: profileId },
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true, department: true } },
          truckAssignment: {
            where: { isActive: true },
            include: { truck: { select: { id: true, name: true, licensePlate: true } } },
            take: 1,
          },
        },
      });
    });
  }

  async delete(profileId: number) {
    const profile = await prisma.driverProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'נהג לא נמצא');

    return prisma.$transaction(async (tx) => {
      await tx.truckAssignment.updateMany({
        where: { driverProfileId: profileId, isActive: true },
        data: { isActive: false },
      });
      await tx.user.update({ where: { id: profile.userId }, data: { isActive: false } });
    });
  }
}

export const driversService = new DriversService();
