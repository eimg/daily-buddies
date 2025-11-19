import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../prisma";

const ROUNDS = 10;

export async function hashPassword(raw: string) {
  return bcrypt.hash(raw, ROUNDS);
}

export async function verifyPassword(raw: string, hash: string) {
  return bcrypt.compare(raw, hash);
}

interface TokenPayload {
  userId: string;
  role: UserRole;
  familyId?: string | null;
}

export function createToken(payload: TokenPayload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: "7d",
  });
}
