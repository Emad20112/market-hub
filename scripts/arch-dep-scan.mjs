//一次性 تحليل: خريطة اعتماد دوال SQL بين ملفات الترحيلات (للمراجعة المعمارية فقط)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

// capture function definitions (schema-qualified or not)
const fnOwner = new Map(); // name -> Set of files
const defsPerFile = new Map(); // file -> Set of names
const fnRe = /create\s+(or\s+replace\s+)?function\s+([a-z_][\w]*\.)?([a-z_][\w]*)/gi;

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8").toLowerCase();
  const names = new Set();
  for (const m of sql.matchAll(fnRe)) {
    const name = m[3];
    names.add(name);
    if (!fnOwner.has(name)) fnOwner.set(name, new Set());
    fnOwner.get(name).add(f);
  }
  defsPerFile.set(f, names);
}

// scan each file body for calls to functions owned by OTHER files
const callsRe = /\b([a-z_][\w]*)\s*\(/g;
const deps = new Map(); // file -> Map(otherFile -> Set of fn)
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8").toLowerCase();
  const own = defsPerFile.get(f);
  const found = new Map();
  for (const m of sql.matchAll(callsRe)) {
    const name = m[1];
    if (own.has(name)) continue; // self / same-file
    const owners = fnOwner.get(name);
    if (!owners) continue;
    for (const o of owners) {
      if (o === f) continue;
      if (!found.has(o)) found.set(o, new Set());
      found.get(o).add(name);
    }
  }
  deps.set(f, found);
}

let out = "";
for (const [f, found] of deps) {
  if (!found.size) continue;
  out += `\n## ${f}\n`;
  const entries = [...found.entries()].sort((a, b) => b[1].size - a[1].size);
  for (const [target, fns] of entries) {
    out += `- -> ${target} (${fns.size}): ${[...fns].slice(0, 15).join(", ")}${fns.size > 15 ? ", ..." : ""}\n`;
  }
}
writeFileSync("supabase/arch-dep-scan.md", out);
console.log("wrote supabase/arch-dep-scan.md", out.length, "chars");
