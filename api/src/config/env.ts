import "dotenv/config";

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is missing from environment. Using fallback.");
}

export const env = {
  port: PORT,
  jwtSecret: JWT_SECRET,
  nodeEnv: process.env.NODE_ENV ?? "development",
};
