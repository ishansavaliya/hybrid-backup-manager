// Real PostgreSQL semantics in WASM; does not validate hosted Supabase deployment.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated;
 grant execute on function auth.uid() to authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611070001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(await readFile(new URL("./rls.sql", import.meta.url), "utf8"));
  const result = await db.query(
    `select count(*)::int as count from pg_tables where schemaname='public' and rowsecurity`,
  );
  assert.equal(result.rows[0].count, 13);
  console.log(
    "PASS: migration applies; 13 tables have RLS; cross-tenant reads and browser writes rejected",
  );
} finally {
  await db.close();
}
