/**
 * Migration script: Set username = email for existing users who don't have a username yet.
 * Run with: npx ts-node scripts/migrate-usernames.ts
 * Or after build: node dist/scripts/migrate-usernames.js
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ where: { username: null } });
  console.log(`Found ${users.length} users without username`);

  for (const user of users) {
    const username = user.email || `user_${user.id}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    });
    console.log(`Set username for user ${user.id}: ${username}`);
  }

  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
