// تطبيق ترحيل على قاعدة محلية مباشرة — أداة عامة (للاستخدام اليدوي)
import fs from "node:fs";
import pg from "pg";

const url = process.argv[2];
const file = process.argv[3];
if (!url || !file) {
  console.error("usage: node scripts/apply-migration-once.mjs <db-url> <migration.sql>");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
const sql = fs.readFileSync(file, "utf8");
try {
  await pool.query(sql);
  console.log("APPLIED:", file, "→", url);
} finally {
  await pool.end();
}
