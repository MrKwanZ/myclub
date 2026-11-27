import { prisma } from "./db";
import { hashPassword } from "./password";

export const ADMIN_EMAIL = "admin@myclub.app";
export const ADMIN_PASSWORD = "admin123";
export const ADMIN_NAME = "Administrator";
export const ADMIN_CLUB_NAME = "Administrator";

/** Creates the super admin account when it is missing, and keeps the documented password working. */
export async function ensureAdministrator() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } })
    : await prisma.user.create({
        data: { email: ADMIN_EMAIL, name: ADMIN_NAME, passwordHash },
      });

  const club =
    (await prisma.club.findFirst({ where: { name: ADMIN_CLUB_NAME } })) ??
    (await prisma.club.create({ data: { name: ADMIN_CLUB_NAME } }));

  await prisma.membership.upsert({
    where: { userId_clubId: { userId: user.id, clubId: club.id } },
    update: { role: "admin" },
    create: { userId: user.id, clubId: club.id, role: "admin" },
  });
}
