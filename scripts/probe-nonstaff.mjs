import { connect } from './db-run.mjs';
const c = await connect();
await c.connect();
await c.query('begin');
await c.query(`set local role authenticated`);
await c.query(`set local "request.jwt.claims" = '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}'`);
try {
  const r = await c.query(`select set_company_costing_method('STANDARD','CATALOGUE','x')`);
  console.log('RETURNED (allowed!):', JSON.stringify(r.rows));
} catch (e) {
  console.log('ERROR:', e.message);
}
console.log('has_role for fake uid:', (await c.query(`select public.has_role('00000000-0000-0000-0000-000000000000'::uuid,'owner') h, public.is_staff('00000000-0000-0000-0000-000000000000'::uuid) s`)).rows);
console.log('uid from claims:', (await c.query(`select auth.uid() u`)).rows);
await c.query('rollback');
await c.end();