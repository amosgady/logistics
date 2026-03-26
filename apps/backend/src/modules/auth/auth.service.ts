import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { emailService } from '../../services/email.service';

export class AuthService {
  async login(username: string, password: string) {
    // Case-insensitive username match, then fallback to email match
    const lowerUsername = username.toLowerCase();
    let user = await prisma.user.findFirst({
      where: {
        username: { equals: lowerUsername, mode: 'insensitive' },
        isActive: true,
      },
      include: {
        userZones: { select: { zoneId: true } },
      },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          email: { equals: lowerUsername, mode: 'insensitive' },
          isActive: true,
        },
        include: {
          userZones: { select: { zoneId: true } },
        },
      });
    }

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'שם משתמש או סיסמה שגויים');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'שם משתמש או סיסמה שגויים');
    }

    // Check if 2FA is enabled for this user
    if (user.twoFactorEnabled) {
      if (!user.email) {
        throw new AppError(400, 'NO_EMAIL', 'לא ניתן לבצע אימות דו-שלבי ללא כתובת אימייל');
      }

      // Generate 6-digit code
      const code = crypto.randomInt(100000, 999999).toString();
      const codeHash = await bcrypt.hash(code, 10);
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Save hashed code + expiry to DB
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorCode: codeHash,
          twoFactorExpiry: expiry,
        },
      });

      // Send code to user's email
      try {
        await emailService.sendVerificationCode(user.email, code);
      } catch (err) {
        console.error('[AuthService] Failed to send 2FA email:', err);
        throw new AppError(500, 'EMAIL_SEND_FAILED', 'שגיאה בשליחת קוד אימות לאימייל');
      }

      // Create a short-lived temp token
      const tempToken = jwt.sign(
        { userId: user.id, type: '2fa' },
        env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return {
        requiresTwoFactor: true,
        tempToken,
      };
    }

    // No 2FA — issue tokens directly
    const userZoneIds = user.userZones?.map((uz: any) => uz.zoneId) || [];
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role, department: user.department, zoneIds: userZoneIds },
      env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash: _, twoFactorCode: _c, twoFactorExpiry: _e, userZones: _uz, ...safeUser } = user;

    return { accessToken, refreshToken, user: { ...safeUser, zoneIds: userZoneIds } };
  }

  async verifyTwoFactor(tempToken: string, code: string) {
    // Verify temp token
    let payload: { userId: number; type: string };
    try {
      payload = jwt.verify(tempToken, env.JWT_SECRET) as { userId: number; type: string };
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'טוקן זמני לא תקין או פג תוקף');
    }

    if (payload.type !== '2fa') {
      throw new AppError(401, 'INVALID_TOKEN', 'טוקן לא תקין');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_TOKEN', 'משתמש לא נמצא');
    }

    // Check code expiry
    if (!user.twoFactorCode || !user.twoFactorExpiry) {
      throw new AppError(400, 'NO_CODE', 'לא נשלח קוד אימות. נסה להתחבר מחדש.');
    }

    if (new Date() > user.twoFactorExpiry) {
      throw new AppError(400, 'CODE_EXPIRED', 'קוד האימות פג תוקף. נסה להתחבר מחדש.');
    }

    // Compare code hash
    const codeValid = await bcrypt.compare(code, user.twoFactorCode);
    if (!codeValid) {
      throw new AppError(401, 'INVALID_CODE', 'קוד אימות שגוי');
    }

    // Clear code from DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: null,
        twoFactorExpiry: null,
      },
    });

    // Load user zones
    const userZones = await prisma.userZone.findMany({ where: { userId: user.id }, select: { zoneId: true } });
    const userZoneIds = userZones.map((uz) => uz.zoneId);

    // Issue real tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role, department: user.department, zoneIds: userZoneIds },
      env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash: _, twoFactorCode: _c, twoFactorExpiry: _e, ...safeUser } = user;

    return { accessToken, refreshToken, user: { ...safeUser, zoneIds: userZoneIds } };
  }

  async resendTwoFactorCode(tempToken: string) {
    // Verify temp token
    let payload: { userId: number; type: string };
    try {
      payload = jwt.verify(tempToken, env.JWT_SECRET) as { userId: number; type: string };
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'טוקן זמני לא תקין או פג תוקף');
    }

    if (payload.type !== '2fa') {
      throw new AppError(401, 'INVALID_TOKEN', 'טוקן לא תקין');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_TOKEN', 'משתמש לא נמצא');
    }
    if (!user.email) {
      throw new AppError(400, 'NO_EMAIL', 'לא ניתן לשלוח קוד ללא כתובת אימייל');
    }

    // Generate new code
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: codeHash,
        twoFactorExpiry: expiry,
      },
    });

    try {
      await emailService.sendVerificationCode(user.email, code);
    } catch (err) {
      console.error('[AuthService] Failed to resend 2FA email:', err);
      throw new AppError(500, 'EMAIL_SEND_FAILED', 'שגיאה בשליחת קוד אימות לאימייל');
    }

    return { sent: true };
  }

  async toggleTwoFactor(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');
    }

    const newValue = !user.twoFactorEnabled;

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: newValue,
        // Clear any pending code when toggling
        twoFactorCode: null,
        twoFactorExpiry: null,
      },
    });

    return { twoFactorEnabled: newValue };
  }

  async getTwoFactorStatus(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');
    }
    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  async refreshToken(token: string) {
    try {
      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
        userId: number;
        type: string;
      };

      if (payload.type !== 'refresh') {
        throw new AppError(401, 'INVALID_TOKEN', 'טוקן לא תקין');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { userZones: { select: { zoneId: true } } },
      });

      if (!user || !user.isActive) {
        throw new AppError(401, 'INVALID_TOKEN', 'משתמש לא פעיל');
      }

      const userZoneIds = user.userZones?.map((uz) => uz.zoneId) || [];
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role, department: user.department, zoneIds: userZoneIds },
        env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return { accessToken };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'INVALID_TOKEN', 'טוקן לא תקין');
    }
  }

  async getProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        department: true,
        phone: true,
        isActive: true,
        createdAt: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'משתמש לא נמצא');
    }

    return user;
  }
}

export const authService = new AuthService();
