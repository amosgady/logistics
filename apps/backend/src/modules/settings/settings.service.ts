import prisma from '../../utils/prisma';

const DEFAULT_WAIT_TIMES: Record<string, number> = {
  GENERAL_TRANSPORT: 30,
  KITCHEN_TRANSPORT: 30,
  INTERIOR_DOOR_TRANSPORT: 30,
  SHOWER_INSTALLATION: 45,
  INTERIOR_DOOR_INSTALLATION: 45,
  KITCHEN_INSTALLATION: 45,
};

export class SettingsService {
  async getDepartmentSettings() {
    const rows = await prisma.departmentSettings.findMany();
    // Merge DB settings with defaults
    const result: { department: string; waitTimeMinutes: number }[] = [];
    for (const [dept, defaultTime] of Object.entries(DEFAULT_WAIT_TIMES)) {
      const row = rows.find((r) => r.department === dept);
      result.push({
        department: dept,
        waitTimeMinutes: row ? row.waitTimeMinutes : defaultTime,
      });
    }
    return result;
  }

  async updateDepartmentSettings(settings: { department: string; waitTimeMinutes: number }[]) {
    for (const setting of settings) {
      await prisma.departmentSettings.upsert({
        where: { department: setting.department as any },
        update: { waitTimeMinutes: setting.waitTimeMinutes },
        create: {
          department: setting.department as any,
          waitTimeMinutes: setting.waitTimeMinutes,
        },
      });
    }
    return this.getDepartmentSettings();
  }

  async getWaitTimeForDepartment(department: string): Promise<number> {
    const row = await prisma.departmentSettings.findUnique({
      where: { department: department as any },
    });
    return row?.waitTimeMinutes ?? DEFAULT_WAIT_TIMES[department] ?? 45;
  }

  // ─── Truck Colors ───

  async getTruckColors(): Promise<{ department: string; color: string }[]> {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'truckColors' } });
    if (!row) return [];
    try { return JSON.parse(row.value); } catch { return []; }
  }

  async updateTruckColors(colors: { department: string; color: string }[]): Promise<{ department: string; color: string }[]> {
    await prisma.systemSetting.upsert({
      where: { key: 'truckColors' },
      update: { value: JSON.stringify(colors) },
      create: { key: 'truckColors', value: JSON.stringify(colors) },
    });
    return colors;
  }
  // ─── Truck Sizes ───

  async getTruckSizes(): Promise<string[]> {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'truckSizes' } });
    if (!row) return ['קטנה', 'גדולה'];
    try { return JSON.parse(row.value); } catch { return ['קטנה', 'גדולה']; }
  }

  async updateTruckSizes(sizes: string[]): Promise<string[]> {
    await prisma.systemSetting.upsert({
      where: { key: 'truckSizes' },
      update: { value: JSON.stringify(sizes) },
      create: { key: 'truckSizes', value: JSON.stringify(sizes) },
    });
    return sizes;
  }
}

export const settingsService = new SettingsService();
