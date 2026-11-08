// دمج منظم لأنواع المخطط: Tables/Views/Enums/CompositeTypes من مولّد supabase،
// وكتلة Functions تبقى بصيغة المشروع (npm run db:types).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function extractBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length;
  let depth = 1;
  while (depth > 0 && i < src.length) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return src.slice(start, i);
}

let gen;
try {
  gen = execFileSync(
    "node_modules/@supabase/cli-windows-x64/bin/supabase.exe",
    [
      "gen", "types", "typescript",
      "--db-url", "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres?sslmode=disable",
    ],
    { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
  ).toString("utf8").replace(/^\uFEFF/, "");
} catch (e) {
  console.error("gen failed:", e.message);
  process.exit(1);
}

const cur = readFileSync("src/integrations/supabase/types.ts", "utf8");

const genPublic = gen.slice(gen.indexOf(`"public": {`));
const newTables = extractBlock(genPublic, "Tables: {");
const newViews = extractBlock(genPublic, "Views: {");
const newEnums = extractBlock(genPublic, "Enums: {");
const newComposite = extractBlock(genPublic, "CompositeTypes: {");
const oldFunctions = extractBlock(cur, "Functions: {");
console.log("blocks:", !!newTables, !!newViews, !!newEnums, !!newComposite, !!oldFunctions);
if (!newTables || !newViews || !newEnums || !newComposite || !oldFunctions) {
  throw new Error("block extraction failed");
}

const head = cur.slice(0, cur.indexOf("public: {") + "public: {".length);
const next =
  head +
  "\n    Tables: {" + newTables.slice("Tables: {".length) +
  "\n    Views: {" + newViews.slice("Views: {".length) +
  "\n    Functions: {" + oldFunctions.slice("Functions: {".length) +
  "\n    Enums: {" + newEnums.slice("Enums: {".length) +
  "\n    CompositeTypes: {" + newComposite.slice("CompositeTypes: {".length) +
  "\n  },\n}";

writeFileSync("src/integrations/supabase/types.ts", next, "utf8");
console.log(
  "rebuilt:",
  "milling:", next.includes("milling_service_documents"),
  "| custody:", next.includes("custody_ledger"),
  "| enums:", next.includes("account_type"),
  "| functions:", next.includes("post_stock_delta"),
);
