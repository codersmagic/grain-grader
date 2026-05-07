import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./schema";
import { count } from "drizzle-orm";
import crypto from "crypto";

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32).toString("hex");
    process.env.AUTH_SECRET = secret;
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}

export async function createToken(
  userId: number,
  username: string
): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ userId, username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret);
}

export async function verifyToken(
  token: string
): Promise<{ userId: number; username: string } | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as number,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<{
  userId: number;
  username: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<{
  userId: number;
  username: string;
}> {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function needsSetup(): boolean {
  const result = db.select({ value: count() }).from(users).get();
  return !result || result.value === 0;
}
