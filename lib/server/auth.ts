import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { can, type Permission, type Role } from "@/lib/domain";

const COOKIE = "cm_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string;
  company: { id: string; name: string; timezone: string };
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
}

/** Current user, or null. Cached per request. Disabled users and expired sessions are rejected. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { company: { select: { id: true, name: true, timezone: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "active") return null;
  const u = session.user;
  return { id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId, company: u.company };
});

/** For pages: redirect to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class AuthzError extends Error {}

/** For server actions: throws instead of redirecting so the action can return a typed error. */
export async function requirePermission(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthzError("Your session has expired. Sign in again.");
  if (permission && !can(user.role, permission)) {
    throw new AuthzError("You do not have permission to do that.");
  }
  return user;
}
