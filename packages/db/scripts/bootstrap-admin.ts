#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, UserRole } from '../src';

// Load root .env if not already set
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

async function bootstrapAdmin() {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let reason: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
      i++;
    } else if (args[i] === '--reason' && args[i + 1]) {
      reason = args[i + 1];
      i++;
    }
  }

  if (!email || !reason) {
    console.error('Usage: pnpm bootstrap:admin --email <user_email> --reason "<explicit_reason>"');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.error(
        `[Error] Target user with email "${normalizedEmail}" does not exist in the database.`,
      );
      console.error('The user must first sign in / register before their role can be elevated.');
      process.exit(1);
    }

    if (user.role === UserRole.ADMIN) {
      console.log(`[Info] User "${normalizedEmail}" is already an administrator.`);
      process.exit(0);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { role: UserRole.ADMIN },
      });

      await tx.auditLog.create({
        data: {
          actorId: null, // SYSTEM_CLI_BOOTSTRAP
          actorRole: null,
          action: 'ADMIN_ROLE_GRANTED',
          targetType: 'USER',
          targetId: user.id,
          changes: {
            role: { from: user.role, to: UserRole.ADMIN },
            reason,
            source: 'CLI_BOOTSTRAP',
          },
        },
      });
    });

    console.log(`[Success] User "${normalizedEmail}" (${user.id}) elevated to ADMIN.`);
    console.log(`[Audit] Transactionally logged ADMIN_ROLE_GRANTED with reason: "${reason}".`);
  } catch (error) {
    console.error('[Fatal] Administrator bootstrap failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrapAdmin();
