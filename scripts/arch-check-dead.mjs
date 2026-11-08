// فحص إضافي: مرشحات الحذف يُبحث عنها نصًا في src بالكامل (يلتقط الاستدعاء الديناميكي)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const names = process.argv.slice(2);
const files = readdirSync("src", { recursive: true }).filter((f) => /\.(ts|tsx|sql|md)$/.test(f));
for (const n of names) {
  const hits = [];
  for (const f of files) {
    const txt = readFileSync(join("src", f), "utf8");
    if (new RegExp(`\\b${n}\\b`).test(txt)) hits.push(f);
  }
  console.log(`${n}: ${hits.length ? "USED -> " + hits.join(", ") : "not in src"}`);
}
