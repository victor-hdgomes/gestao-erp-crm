import "dotenv/config";

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-test-secret-test-32b";
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");
