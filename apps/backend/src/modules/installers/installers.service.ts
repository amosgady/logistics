import bcrypt from 'bcryptjs';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class InstallersService {
  async getAll() {
    return prisma.installerProfile.findMany({
      include: {
        user: {
          select: { id: true, fullName: true, phone: true, email: true, isActive: true },
        },
        zone: { select: { id: true, name: true, nameHe: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
  }

  async create(data: {
    email: string; password: string; fullName: string; phone?: string;
    department: string; zoneId?: number; startTime: string; endTime: string;
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
          role: 'INSTALLER',
          phone: data.phone || null,
          department: data.department as any,
        },
      });

      const profile = await tx.installerProfile.create({
        data: {
          userId: user.id,
          startTime: data.startTime,
          endTime: data.endTime,
          zoneId: data.zoneId || null,
          department: data.department as any,
        },
      });

      return profile;
    });
  }

  async update(profileId: number, data: {
    fullName?: string; phone?: string; department?: string;
    zoneId?: number | null; startTime?: string; endTime?: string; isActive?: boolean;
  }) {
    const profile = await prisma.installerProfile.findUnique({
      where: { id: profileId },
      include: { user: true },
    });
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'מתקין לא נמצא');

    return prisma.$transaction(async (tx) => {
      const userUpdate: any = {};
      if (data.fullName !== undefined) userUpdate.fullName = data.fullName;
      if (data.phone !== undefined) userUpdate.phone = data.phone;
      if (data.isActive !== undefined) userUpdate.isActive = data.isActive;
      if (data.department) userUpdate.department = data.department as any;

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: profile.userId }, data: userUpdate });
      }

      const profileUpdate: any = {};
      if (data.startTime) profileUpdate.startTime = data.startTime;
      if (data.endTime) profileUpdate.endTime = data.endTime;
      if ('zoneId' in data) profileUpdate.zoneId = data.zoneId || null;
      if (data.department) profileUpdate.department = data.department as any;

      if (Object.keys(profileUpdate).length > 0) {
        await tx.installerProfile.update({ where: { id: profileId }, data: profileUpdate });
      }

      return tx.installerProfile.findUnique({
        where: { id: profileId },
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true } },
          zone: { select: { id: true, name: true, nameHe: true } },
        },
      });
    });
  }

  async delete(profileId: number) {
    const profile = await prisma.installerProfile.findUnique({
      where: { id: profileId },
      include: { user: true },
    });
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'מתקין לא נמצא');

    if (profile.user.isActive) {
      // Active installer → soft delete (deactivate)
      return prisma.user.update({
        where: { id: profile.userId },
        data: { isActive: false },
      });
    }

    // Inactive installer → permanent hard delete
    await prisma.$transaction(async (tx) => {
      // Unassign orders from installer's routes
      const routes = await tx.route.findMany({
        where: { installerProfileId: profileId },
        select: { id: true },
      });
      if (routes.length > 0) {
        const routeIds = routes.map((r) => r.id);
        await tx.order.updateMany({
          where: { routeId: { in: routeIds } },
          data: { routeId: null, routeSequence: null, timeWindow: null, estimatedArrival: null },
        });
        await tx.route.deleteMany({ where: { id: { in: routeIds } } });
      }

      // Delete installer assignments
      await tx.installerAssignment.deleteMany({ where: { installerProfileId: profileId } });

      // Delete profile then user
      await tx.installerProfile.delete({ where: { id: profileId } });
      await tx.user.delete({ where: { id: profile.userId } });
    });

    return { deleted: true };
  }
}

export const installersService = new InstallersService();
