// 本機 Postgres：模擬 Supabase 的 auth.uid()、anon/authenticated 角色，跑 SQL 驗證
const EmbeddedPostgres = require("embedded-postgres").default;
const { Client } = require("pg");
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "../../../supabase") + "/";
async function boot() {
  const dir = require("path").join(require("os").tmpdir(), "tt-pg-" + process.pid);
  fs.rmSync(dir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54329, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start();
  const c = new Client({ host: "localhost", port: 54329, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  await c.query(`
    create extension if not exists pgcrypto;
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.profiles(id uuid primary key references auth.users(id), handle text, display_name text, avatar_url text);
    create table public.follows(follower_id uuid, following_id uuid, primary key(follower_id, following_id));
    create table public.posts(id uuid primary key default gen_random_uuid(), author_id uuid, trail_id text, visibility text default 'public', hidden boolean default false, hiked_on date, created_at timestamptz default now(), duration_ms bigint, distance_km numeric, ascent int);
    create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), actor_id uuid references auth.users(id), type text not null, post_id uuid, read boolean not null default false, created_at timestamptz not null default now());
    alter table public.notifications enable row level security;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select on all tables in schema public to anon;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create or replace function public.is_friend(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
      select exists(select 1 from follows where follower_id = a and following_id = b) and exists(select 1 from follows where follower_id = b and following_id = a); $$;
  `);
  return { pg, c };
}
// 以某人身分執行
async function as(c, uid, sql, params) {
  await c.query("begin");
  try {
    await c.query(uid ? "set local role authenticated" : "set local role anon");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || ""]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { rows: r.rows, err: null };
  } catch (e) { await c.query("rollback"); return { rows: [], err: e.message }; }
}
module.exports = { boot, as, ROOT };
