import pg from "pg";
const pool = new pg.Pool({
  connectionString:
    process.env.SERVER_DATABASE_URL ??
    "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres",
});
const { rows } = await pool.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
   WHERE conrelid = 'public.expense_approvals'::regclass AND contype='c'`);
console.table(rows);
await pool.end();
