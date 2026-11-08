// Architecture Review v2: تصنيف كل دالة SQL وفق القرار الجديد
// (Backend هو مركز منطق الأعمال). المخرج: supabase/arch-fn-classification.md
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const migDir = "supabase/migrations";
const srcDir = "src";
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

// 1) تعريفات الدوال (بالمواضع) — يدعم $$ و $tag$
const fnStartRe = /create\s+(or\s+replace\s+)?function\s+/gi;
const fns = []; // {name, file, header, body}
for (const f of files) {
  const sql = readFileSync(join(migDir, f), "utf8");
  for (const m of sql.matchAll(fnStartRe)) {
    const start = m.index;
    const name = /^(?:create\s+(?:or\s+replace\s+)?function\s+)(?:[a-z_][\w]*\.)?([a-z_][\w]*)/i.exec(
      sql.slice(start, start + 400),
    )?.[1];
    if (!name) continue;
    const tag = /\$([A-Za-z_]*)\$/.exec(sql.slice(start, start + 2000))?.[0];
    let end = sql.length;
    if (tag) {
      const close = sql.indexOf(tag, start + sql.slice(start, start + 2000).indexOf(tag) + tag.length);
      if (close !== -1) end = sql.indexOf(";", close);
    }
    const text = sql.slice(start, end === sql.length ? sql.length : end + 1);
    fns.push({ name: name.toLowerCase(), file: f, text: text.toLowerCase(), header: text.slice(0, 600) });
  }
}

// 2) الاستدعاءات داخل دوال SQL (call graph) — للاعتماد فقط على التعريفات
const defined = new Map(); // name -> defs[]
for (const fn of fns) {
  if (!defined.has(fn.name)) defined.set(fn.name, []);
  defined.get(fn.name).push(fn);
}
const callersOf = new Map(); // name -> Set<"file"|fnName>
const addCaller = (n, c) => {
  if (!callersOf.has(n)) callersOf.set(n, new Set());
  callersOf.get(n).add(c);
};
const identCall = /\b([a-z_][\w]*)\s*\(/g;
for (const fn of fns) {
  for (const m of fn.text.matchAll(identCall)) {
    const n = m[1];
    if (n === fn.name) continue;
    if (defined.has(n)) addCaller(n, `fn:${fn.name} (${fn.file})`);
  }
}

// 3) بذور "تبقى": مشغلات + سياسات RLS + فهارس/أعمدة مولّدة/قيود
const staySeeds = new Map(); // name -> reason
for (const f of files) {
  const sql = readFileSync(join(migDir, f), "utf8");
  // triggers
  for (const m of sql.matchAll(/execute\s+(?:function|procedure)\s+([a-z_][\w]*\.)*([a-z_][\w]*)/gi)) {
    staySeeds.set(m[2].toLowerCase(), `trigger في ${f}`);
  }
  // policies: كتل create policy حتى ';' التالية
  const polRe = /create\s+policy[\s\S]*?;/gi;
  for (const m of sql.matchAll(polRe)) {
    const block = m[0].toLowerCase();
    for (const c of block.matchAll(identCall)) {
      if (defined.has(c[1])) {
        const r = `تعبير سياسة RLS في ${f}`;
        if (!staySeeds.has(c[1])) staySeeds.set(c[1], r);
      }
    }
  }
}

// 4) إغلاق انتقالي: دوال يستدعيها من تبقى (لا يمكن فصلها عن التحقق داخل القاعدة)
const staying = new Set(staySeeds.keys());
let changed = true;
while (changed) {
  changed = false;
  for (const s of staying) {
    for (const def of defined.get(s) || []) {
      for (const m of def.text.matchAll(identCall)) {
        if (defined.has(m[1]) && !staying.has(m[1])) {
          staying.add(m[1]);
          changed = true;
        }
      }
    }
  }
}

// 5) استدعاءات الواجهة: أسماء .rpc() في src
const feCalls = new Set();
for (const f of readdirSync(srcDir, { recursive: true })) {
  if (!/\.(ts|tsx)$/.test(f)) continue;
  const txt = readFileSync(join(srcDir, f), "utf8");
  for (const m of txt.matchAll(/\.rpc[<(]\s*["'`]?(\w+)/g)) feCalls.add(m[1].toLowerCase());
}
// استدعاءات الواجهة ديناميكية (rpcName)
const dynFiles = [];
for (const f of readdirSync(srcDir, { recursive: true })) {
  if (!/\.(ts|tsx)$/.test(f)) continue;
  const txt = readFileSync(join(srcDir, f), "utf8");
  if (/\.rpc\(/.test(txt)) dynFiles.push(f);
}

// 6) التصنيف
const cat = { stay: [], move: [], moveRedesign: [], deleteCandidate: [] };
const seen = new Set();
const feUsed = (n) => feCalls.has(n);
for (const fn of fns) {
  if (seen.has(fn.name)) continue; // overloads: نفس الاسم = نفس القرار (يُفصل لاحقًا في التحليل)
  seen.add(fn.name);
  const callers = [...(callersOf.get(fn.name) || [])].filter((c) => !c.startsWith(`fn:${fn.name} `));
  const fe = feUsed(fn.name);
  const isTrigger = /returns\s+trigger/.test(fn.text);
  if (staying.has(fn.name)) {
    cat.stay.push({ name: fn.name, file: fn.file, reason: staySeeds.get(fn.name) || "يستدعيه من تبقى داخل القاعدة", fe });
  } else if (callers.length === 0 && !fe) {
    cat.deleteCandidate.push({ name: fn.name, file: fn.file, fe, reason: "لا مستدعين داخل SQL ولا من الواجهة" });
  } else {
    // workflow/تنسيق دورة عمل أم دالة حسابية/قراءة؟ تقريب: الأكبر حجمًا و multi-table = إعادة تصميم
    const big = fn.text.length > 6000 || /\b(insert\s+into[\s\S]*insert\s+into)/.test(fn.text);
    (big ? cat.moveRedesign : cat.move).push({ name: fn.name, file: fn.file, fe, callers: callers.length });
  }
}

// 7) تقرير
const sec = (title, list, withReason = false) => {
  let s = `\n## ${title} (${list.length})\n`;
  for (const x of list.sort((a, b) => a.name.localeCompare(b.name))) {
    s += withReason
      ? `- \`${x.name}\` — ${x.file}${x.fe ? " — **تستدعيها الواجهة**" : ""} — السبب: ${x.reason}\n`
      : `- \`${x.name}\` — ${x.file}${x.fe ? " — **تستدعيها الواجهة**" : ""}${x.callers ? ` — ${x.callers} مستدعي SQL` : ""}\n`;
  }
  return s;
};
let out = `# تصنيف دوال SQL وفق Architecture v2 (Backend = مركز المنطق)\n\n> مولّد آليًا من scripts/arch-classify.mjs على ترحيلات ${files.length} ملف و ${fns.length} تعريف دالة.\n> استدعاءات الواجهة: ${feCalls.size} دالة RPC من ${dynFiles.length} ملف.\n`;
out += `\n- **تبقى في القاعدة:** ${cat.stay.length}\n- **تنتقل إلى Backend:** ${cat.move.length}\n- **تنتقل مع إعادة تصميم (workflow متعدد الجداول):** ${cat.moveRedesign.length}\n- **مرشحة للحذف (ميتة ظاهريًا):** ${cat.deleteCandidate.length}\n`;
out += `\n## استدعاءات RPC الديناميكية في الواجهة (تحتاج معالجة يدوية)\n${dynFiles.map((f) => `- ${f}`).join("\n")}\n`;
out += sec("تبقى في قاعدة البيانات", cat.stay, true);
out += sec("تنتقل مع إعادة تصميم", cat.moveRedesign);
out += sec("تنتقل كما هي (منطق قابل للترجمة مباشرة)", cat.move);
out += sec("مرشحة للحذف", cat.deleteCandidate, true);
writeFileSync("supabase/arch-fn-classification.md", out);
console.log(
  `stay=${cat.stay.length} move=${cat.move.length} moveRedesign=${cat.moveRedesign.length} delete=${cat.deleteCandidate.length}`,
);
