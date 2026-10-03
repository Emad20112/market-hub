// قبول: تقارير المطحنة التجارية — الهامش بأساس تكشفه، ومخزون المطحنة فقط
import { connect } from "./db-run.mjs";

const c = await connect();
await c.connect();
let pass = 0,
  fail = 0;
const ok = (l, v, want) => {
  const good = String(v) === String(want);
  good ? pass++ : fail++;
  console.log(
    `${good ? "PASS" : "FAIL"}  ${l}  →  ${v}${good ? "" : `   (expected ${want})`}`,
  );
};
const q = (s, p = []) => c.query(s, p);
const n = (v) => String(Number(v));

await q("begin");

// ── 1. الحالة الراهنة: لا مبيعات بضاعة، فالتقرير فارغ لا خاطئ ──
const emptyRows = (await q(`select count(*)::int n from milling_margin_report`)).rows[0].n;
ok("no goods sold yet, so the margin report is empty", emptyRows, 0);
ok("and not a phantom row",
  (await q(`select count(*)::int n from milling_margin_report where revenue > 0`)).rows[0].n, 0);

// service invoices must never enter a goods margin
ok("existing service invoices are excluded from goods margin",
  (await q(`select count(*)::int n from milling_margin_report
             where sku like 'SRV-MILL%'`)).rows[0].n, 0);

// ── 2. مخزون المطحنة: شركة فقط، وأمانات العميل مستثناة ──
// The invariant that matters: the report's total on-hand must equal the
// COMPANY-owned inventory for those classes, and must NOT equal the grand
// total (which would include customer custody).
const millQty = Number((await q(`select coalesce(sum(on_hand_qty),0) t from milling_inventory_report`)).rows[0].t);
const companyQty = Number((await q(`
  select coalesce(sum(i.quantity),0) t from inventory i
   where i.owner_type='COMPANY' and i.owner_id is null
     and i.product_id in (select id from products where item_class in ('RAW_MATERIAL','FINISHED_GOOD','BY_PRODUCT','NON_STOCK_ITEM'))`)).rows[0].t);
const allQty = Number((await q(`select coalesce(sum(quantity),0) t from inventory`)).rows[0].t);
ok("report total equals company-owned stock only", n(millQty), n(companyQty));
ok("and is strictly less than the grand total, i.e. custody is excluded",
  millQty < allQty || allQty === companyQty, true);

// wheat carries a real valued cost
const wheat = (await q(`select on_hand_qty, unit_cost, valuation, cost_basis
                          from milling_inventory_report where sku='RM-WHEAT-HARD'`)).rows[0];
ok("wheat is ACTUALLY costed", wheat.cost_basis, "ACTUAL");
ok("valuation = qty x cost", n(Number(wheat.valuation)),
  n(Number(wheat.on_hand_qty) * Number(wheat.unit_cost)));

// flour was never produced, so it must NOT claim an actual cost
ok("never-produced flour is REFERENCE_ONLY",
  (await q(`select distinct cost_basis from milling_inventory_report where sku='FG-FLOUR-SUPER-50'`)).rows[0].cost_basis,
  "REFERENCE_ONLY");

// ── 3. بيع بضاعة: يظهر الهامش مع أساسه ──
const cust = (await q(`select id from customers where is_active limit 1`)).rows[0].id;
const wh = (await q(`select id from warehouses where is_active order by is_default desc limit 1`)).rows[0].id;
// A FRESH product is used deliberately: FG-FLOUR already carries a seeded cost
// layer, so issuing at a new price would blend into a moving average and the
// test would be measuring arithmetic rather than the report.
const sold = (await q(`
  insert into products (sku,name,name_ar,item_nature,item_class,inventory_policy,tracking,
                        costing_method,cost_price,sale_price,unit_id)
  select 'PROBE-SOLD','probe sold','صنف مبيع للاختبار','GOOD','FINISHED_GOOD','TRACKED','NONE',
         'MOVING_AVERAGE',0,13,unit_id from products limit 1 returning id, sale_price`)).rows[0];

const inv = (await q(`
  insert into sales_invoices (invoice_number, customer_id, warehouse_id, total, status, created_at)
  values ('PROBE-1',$1,$2, 1000*13, 'unpaid', now()) returning id`, [cust, wh])).rows[0].id;
await q(`
  insert into sales_invoice_items (invoice_id, product_id, quantity, unit_price, total, stock_effect)
  values ($1,$2, 1000, 13, 1000*13, 'STOCK_ISSUE')`, [inv, sold.id]);

// give it a real cost, exactly as production would
await q(`select public.apply_cost_movement(
          p_product_id=>$1::uuid, p_warehouse_id=>$2::uuid, p_signed_qty=>1000::numeric,
          p_incoming_cost=>7::numeric, p_source_type=>'acceptance')`, [sold.id, wh]);

const row = (await q(`select sku, qty_sold, revenue, unit_cost, cost_of_goods, margin, cost_basis
                        from milling_margin_report where sku='PROBE-SOLD'`)).rows[0];
ok("the sale now appears", n(row.qty_sold), "1000");
ok("revenue = qty x price", n(row.revenue), "13000");
ok("cost basis is ACTUAL once a cost exists", row.cost_basis, "ACTUAL");
ok("unit cost is the valued one, not the catalogue", n(row.unit_cost), "7");
ok("cost of goods = qty x cost", n(row.cost_of_goods), "7000");
ok("margin = revenue - cost", n(row.margin), "6000");

// ── 4. هامش مبني على مرجع يجب أن يُعلن REFERENCE ──
const bran = (await q(`select id, sale_price from products where sku='FG-BRAN-40'`)).rows[0];
await q(`
  insert into sales_invoices (invoice_number, customer_id, warehouse_id, total, status, created_at)
  values ('PROBE-2',$1,$2, 500*2, 'unpaid', now()) returning id`, [cust, wh]).then(async (r) => {
  const i2 = r.rows[0].id;
  await q(`insert into sales_invoice_items (invoice_id, product_id, quantity, unit_price, total, stock_effect)
             values ($1,$2, 500, $3, 1000, 'STOCK_ISSUE')`, [i2, bran.id, bran.sale_price]);
});
const refRow = (await q(`select cost_basis, unit_cost from milling_margin_report where sku='FG-BRAN-40'`)).rows[0];
ok("an item with no valued movement is declared REFERENCE", refRow.cost_basis, "REFERENCE");

// ── 5. مسودة أو ملغاة لا تُحتسب إيراداً ──
const draftInv = (await q(`
  insert into sales_invoices (invoice_number, customer_id, warehouse_id, total, status, created_at)
  values ('PROBE-3',$1,$2, 999, 'cancelled', now()) returning id`, [cust, wh])).rows[0].id;
await q(`insert into sales_invoice_items (invoice_id, product_id, quantity, unit_price, total, stock_effect)
           values ($1,$2, 1, 999, 999, 'STOCK_ISSUE')`, [draftInv, sold.id]);
const after = (await q(`select qty_sold from milling_margin_report where sku='PROBE-SOLD'`)).rows[0];
ok("a cancelled invoice adds nothing to sales", n(after.qty_sold), "1000");

await q("rollback");
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
await c.end();