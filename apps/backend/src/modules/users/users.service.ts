import bcrypt from 'bcryptjs';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class UsersService {
  async getAll() {
    return prisma.user.findMany({
      select: {
        id: true, username: true, email: true, fullName: true, role: true, department: true,
        phone: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { username: string; email?: string; password: string; fullName: string; role: string; department?: string; phone?: string }) {
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw new AppError(400, 'USERNAME_EXISTS', 'שם משתמש כבר קיים במערכת');

    const passwordHash = await bcrypt.hash(data.password, 12);
    return prisma.user.create({
      data: {
        username: data.username,
        email: data.email || null,
        passwordHash,
        fullName: data.fullName,
        role: data.role as any,
        department: data.department as any || null,
        phone: data.phone || null,
      },
      select: {
        id: true, username: true, email: true, fullName: true, role: true, department: true,
        phone: true, isActive: true, createdAt: true,
      },
    });
  }

  async update(id: number, data: { username?: string; email?: string; password?: string; fullName?: string; role?: string; department?: string | null; phone?: string; isActive?: boolean }) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');

    if (data.username && data.username !== user.username) {
      const existing = await prisma.user.findUnique({ where: { username: data.username } });
      if (existing) throw new AppError(400, 'USERNAME_EXISTS', 'שם משתמש כבר קיים במערכת');
    }

    const updateData: any = { ...data };
    delete updateData.password;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.role) updateData.role = data.role as any;
    if ('department' in data) updateData.department = data.department as any || null;

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, username: true, email: true, fullName: true, role: true, department: true,
        phone: true, isActive: true, createdAt: true,
      },
    });
  }

  async deactivate(id: number) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');

    return prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: number) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');

    await prisma.$transaction(async (tx) => {
      // Delete related records in correct order
      const driverProfiles = await tx.driverProfile.findMany({ where: { userId: id } });
      for (const dp of driverProfiles) {
        await tx.truckAssignment.deleteMany({ where: { driverProfileId: dp.id } });
      }

      const installerProfiles = await tx.installerProfile.findMany({ where: { userId: id } });
      for (const ip of installerProfiles) {
        await tx.installerAssignment.deleteMany({ where: { installerProfileId: ip.id } });
        // Remove installer from routes
        await tx.route.updateMany({ where: { installerProfileId: ip.id }, data: { installerProfileId: null } });
      }

      await tx.workerLocation.deleteMany({ where: { userId: id } });
      await tx.message.deleteMany({ where: { OR: [{ senderId: id }, { recipientId: id }] } });
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.driverProfile.deleteMany({ where: { userId: id } });
      await tx.installerProfile.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  }
}

export const usersService = new UsersService();
