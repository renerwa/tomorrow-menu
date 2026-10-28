import { existsSync } from "node:fs";

async function main(): Promise<void> {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }

  const { getDb } = await import("../src/server/db");
  await getDb();
  console.log("数据库迁移和初始菜库已完成。");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("数据库初始化失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
