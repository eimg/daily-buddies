import { PrismaClient } from "./generated/prisma/client";

export const prisma = new PrismaClient();

export * from "./generated/prisma/client";
