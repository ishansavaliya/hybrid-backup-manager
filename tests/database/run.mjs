// Real PostgreSQL semantics in WASM; does not validate hosted Supabase deployment.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const NOW = "2026-11-10T00:00:00Z";
let failed = false;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL: ${name}\n${error?.stack ?? error}`);
  }
}

async function newClient({
  pcLimit = 1,
  expires = "2027-01-01T00:00:00Z",
  blocked = false,
} = {}) {
  const { rows } = await db.query(
    `insert into clients(name, expires_at, pc_limit, blocked) values ('Test', $1, $2, $3) returning id`,
    [expires, pcLimit, blocked],
  );
  return rows[0].id;
}

async function register(clientId, install, hash) {
  const { rows } = await db.query(
    `select * from bkp_register_device($1, $2, 'PC', 'Win11', '1.0.0', $3, $4)`,
    [
      clientId,
      install,
      hash ?? `tok-${clientId}-${install}-${Math.random()}`,
      NOW,
    ],
  );
  return rows[0];
}

async function signIn(hmac, install) {
  const { rows } = await db.query(
    `select * from bkp_sign_in_with_code($1, $2, 'PC', 'Win11', '1.0.0', $3, $4)`,
    [hmac, install, `tok-${hmac}-${install}-${Math.random()}`, NOW],
  );
  return rows[0];
}

async function deviceCount(clientId, mode) {
  const { rows } = await db.query(
    `select count(*)::int as n from devices where client_id = $1 and ($2::text is null or mode = $2) and removed_at is null`,
    [clientId, mode ?? null],
  );
  return rows[0].n;
}

try {
  await db.exec(`create role anon; create role authenticated;
    grant usage on schema public to anon, authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611100001_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  await check(
    "accounts migration: 8 tables with RLS, anon blocked",
    async () => {
      const { rows } = await db.query(
        `select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity`,
      );
      assert.equal(rows[0].n, 8);
      const { rows: all } = await db.query(
        `select count(*)::int as n from pg_tables where schemaname='public'`,
      );
      assert.equal(all[0].n, 8);
      await db.exec("set role anon");
      try {
        await assert.rejects(() => db.query("select * from clients"));
      } finally {
        await db.exec("reset role");
      }
      await db.exec("set role authenticated");
      try {
        await assert.rejects(() => db.query("select * from clients"));
      } finally {
        await db.exec("reset role");
      }
      const { rows: s } = await db.query(
        `select value from settings where key='renew_contact'`,
      );
      assert.equal(s[0].value, "");
    },
  );

  await check("register: PC limit, idempotent re-register", async () => {
    const c = await newClient({ pcLimit: 1 });
    const a = await register(c, "a");
    assert.equal(a.outcome, "ok");
    assert.equal(a.mode, "full");
    const b = await register(c, "b");
    assert.equal(b.outcome, "pc_limit");
    assert.equal(b.device_id, null);
    assert.equal(b.pc_limit, 1);
    const a2 = await register(c, "a");
    assert.equal(a2.outcome, "ok");
    assert.equal(a2.mode, "full");
    assert.equal(a2.device_id, a.device_id);
    const { rows } = await db.query(
      `select count(*)::int as n from devices where client_id=$1`,
      [c],
    );
    assert.equal(rows[0].n, 1);
  });

  await check(
    "register: expired client gets restore_only and does not use a slot",
    async () => {
      const c = await newClient({
        pcLimit: 1,
        expires: "2026-11-09T00:00:00Z",
      });
      const r = await register(c, "c");
      assert.equal(r.outcome, "ok");
      assert.equal(r.mode, "restore_only");
      assert.equal(await deviceCount(c, "full"), 0);
      assert.equal(await deviceCount(c, "restore_only"), 1);
    },
  );

  await check("register: blocked client gets restore_only", async () => {
    const c = await newClient({ blocked: true });
    const r = await register(c, "d");
    assert.equal(r.outcome, "ok");
    assert.equal(r.mode, "restore_only");
  });

  await check(
    "sign in with code: single use, expiry, PC limit keeps code unused",
    async () => {
      const c = await newClient({ pcLimit: 1 });
      await db.query(
        `insert into login_codes(client_id, code_hmac, expires_at) values ($1, 'h1', $2)`,
        [c, "2026-11-12T00:00:00Z"],
      );
      const ok = await signIn("h1", "p1");
      assert.equal(ok.outcome, "ok");
      assert.equal(ok.client_id, c);
      assert.equal(ok.mode, "full");
      const again = await signIn("h1", "p1");
      assert.equal(again.outcome, "code_invalid");

      await db.query(
        `insert into login_codes(client_id, code_hmac, expires_at) values ($1, 'h-old', $2)`,
        [c, "2026-11-09T00:00:00Z"],
      );
      assert.equal((await signIn("h-old", "p1")).outcome, "code_invalid");

      await db.query(
        `insert into login_codes(client_id, code_hmac, expires_at) values ($1, 'h-full', $2)`,
        [c, "2026-11-12T00:00:00Z"],
      );
      const limited = await signIn("h-full", "p2");
      assert.equal(limited.outcome, "pc_limit");
      const { rows } = await db.query(
        `select used_at from login_codes where code_hmac='h-full'`,
      );
      assert.equal(rows[0].used_at, null);
    },
  );

  await check(
    "last slot: sequential installs in one transaction, row lock present",
    async () => {
      const c = await newClient({ pcLimit: 1 });
      await db.transaction(async (tx) => {
        const q = (install) =>
          tx.query(
            `select * from bkp_register_device($1, $2, 'PC', 'Win11', '1.0.0', $3, $4)`,
            [c, install, `tok-last-${install}`, NOW],
          );
        assert.equal((await q("x")).rows[0].outcome, "ok");
        assert.equal((await q("y")).rows[0].outcome, "pc_limit");
      });
      const { rows } = await db.query(
        `select pg_get_functiondef('bkp_register_device'::regproc) ilike '%for update%' as locked`,
      );
      assert.equal(rows[0].locked, true);
    },
  );

  await check(
    "rate limit: blocks after max failures, resets after window",
    async () => {
      for (let i = 0; i < 5; i++) {
        await db.query(`select bkp_record_failure('k', 900, $1)`, [NOW]);
      }
      const limited = await db.query(
        `select bkp_rate_limited('k', 5, 900, $1) as r`,
        [NOW],
      );
      assert.equal(limited.rows[0].r, true);
      const later = await db.query(
        `select bkp_rate_limited('k', 5, 900, $1::timestamptz + interval '901 seconds') as r`,
        [NOW],
      );
      assert.equal(later.rows[0].r, false);
    },
  );
} finally {
  await db.close();
}
if (failed) process.exit(1);
