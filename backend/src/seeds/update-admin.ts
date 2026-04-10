import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB, getPrisma } from '../shared/database.js';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL and ADMIN_PASSWORD required');
    process.exit(1);
  }

  await connectDB();
  const prisma = getPrisma();
  const hash = await bcrypt.hash(password, 12);

  // Update existing admin or create new one
  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { email, passwordHash: hash },
    });
    console.log(`Updated admin: ${existing.email} → ${email}`);
  } else {
    await prisma.user.create({
      data: { username: 'admin', email, passwordHash: hash, role: 'admin' },
    });
    console.log(`Created admin: ${email}`);
  }

  await disconnectDB();
}

main().catch((err) => { console.error(err); process.exit(1); });
