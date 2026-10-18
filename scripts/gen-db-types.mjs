#!/usr/bin/env node
/**
 * Generate src/lib/database.types.ts from the real database schema, in the same shape as
 * `supabase gen types typescript`, so the Supabase client knows every table, column and
 * function. Run it against a database that has every migration applied:
 *
 *   PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… node scripts/gen-db-types.mjs
 *
 * CI applies all migrations to a fresh Postgres, runs this, and fails if the file changed —
 * so a migration can never ship without its types (and the app code that uses them) updated.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = new URL("../src/lib/database.types.ts", import.meta.url);

function q(sql) {
  const out = execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
  return out ? JSON.parse(out) : [];
}

const columns = q(`
  select coalesce(json_agg(x order by x.rel, x.num), '[]') from (
    select c.relname as rel, c.relkind::text as kind, a.attname as col, a.attnum as num,
           format_type(a.atttypid, a.atttypmod) as type, t.typcategory::text as cat,
           (a.attnotnull) as notnull,
           (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as hasdefault,
           (a.attgenerated <> '') as generated
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
     where n.nspname = 'public' and c.relkind in ('r','v','m') and a.attnum > 0 and not a.attisdropped
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')) x`);

// CHECK (col in ('a','b')) constraints become literal unions ("a" | "b") in the types.
const checks = q(`
  select coalesce(json_agg(x), '[]') from (
    select c.relname as rel, a.attname as col, pg_get_constraintdef(k.oid) as def
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
     where n.nspname = 'public' and k.contype = 'c' and array_length(k.conkey, 1) = 1) x`);
const literalUnions = new Map();
for (const k of checks) {
  const m = k.def.match(/^CHECK \(\(?\(?(\w+)\)?(?:::text)? = ANY \(\(?ARRAY\[(.*)\]\)?(?:::text\[\])?\)\)\)?$/);
  if (!m || m[1] !== k.col) continue;
  const values = [...m[2].matchAll(/'((?:[^']|'')*)'::(?:text|character varying)/g)].map((v) => v[1].replace(/''/g, "'"));
  if (values.length) literalUnions.set(`${k.rel}.${k.col}`, values.map((v) => JSON.stringify(v)).join(" | "));
}

const functions = q(`
  select coalesce(json_agg(x order by x.name, x.args), '[]') from (
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
           p.proretset as setof, format_type(p.prorettype, null) as ret,
           coalesce(p.proargnames, '{}') as argnames,
           coalesce(p.proargmodes::text[], '{}') as argmodes,
           coalesce((select array_agg(format_type(t, null) order by i)
                       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(t, i)), '{}') as argtypes,
           p.pronargs as nargs, p.pronargdefaults as ndefaults
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))) x`);

function tsType(pgType) {
  const t = pgType.replace(/\(.*\)/, "").trim();
  if (t.endsWith("[]")) return `${tsType(t.slice(0, -2))}[]`;
  if (["smallint", "integer", "bigint", "numeric", "real", "double precision"].includes(t)) return "number";
  if (t === "boolean") return "boolean";
  if (["json", "jsonb"].includes(t)) return "Json";
  if (t === "void") return "undefined";
  if (["record", "unknown", "anyelement"].includes(t)) return "unknown";
  return "string"; // text, varchar, uuid, date, time, timestamptz, interval, inet, citext, bytea…
}

// A view column with the same name as a column of a table it reads keeps that column's union.
const viewUses = q(`select coalesce(json_agg(x), '[]') from (
  select view_name as view, table_name as rel, column_name as col from information_schema.view_column_usage where view_schema = 'public') x`);
for (const u of viewUses) {
  const union = literalUnions.get(`${u.rel}.${u.col}`);
  if (union && !literalUnions.has(`${u.view}.${u.col}`)) literalUnions.set(`${u.view}.${u.col}`, union);
}
const colType = (c) => literalUnions.get(`${c.rel}.${c.col}`) ?? tsType(c.type);

const tables = new Map();
for (const c of columns) {
  if (!tables.has(c.rel)) tables.set(c.rel, { kind: c.kind, cols: [] });
  tables.get(c.rel).cols.push(c);
}

const lines = [];
const ind = (n) => "  ".repeat(n);
lines.push("// Generated by scripts/gen-db-types.mjs from the migrations. Do not edit by hand.");
lines.push("// After changing the database, regenerate: see the script's header.");
lines.push("");
lines.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
lines.push("");
lines.push("export type Database = {");
lines.push(`${ind(1)}public: {`);

lines.push(`${ind(2)}Tables: {`);
for (const [name, t] of tables) {
  if (t.kind !== "r") continue;
  lines.push(`${ind(3)}${name}: {`);
  lines.push(`${ind(4)}Row: {`);
  for (const c of t.cols) lines.push(`${ind(5)}${c.col}: ${colType(c)}${c.notnull ? "" : " | null"};`);
  lines.push(`${ind(4)}};`);
  lines.push(`${ind(4)}Insert: {`);
  for (const c of t.cols) {
    if (c.generated) continue;
    const optional = !c.notnull || c.hasdefault;
    lines.push(`${ind(5)}${c.col}${optional ? "?" : ""}: ${colType(c)}${c.notnull ? "" : " | null"};`);
  }
  lines.push(`${ind(4)}};`);
  lines.push(`${ind(4)}Update: {`);
  for (const c of t.cols) if (!c.generated) lines.push(`${ind(5)}${c.col}?: ${colType(c)}${c.notnull ? "" : " | null"};`);
  lines.push(`${ind(4)}};`);
  lines.push(`${ind(4)}Relationships: [];`);
  lines.push(`${ind(3)}};`);
}
lines.push(`${ind(2)}};`);

lines.push(`${ind(2)}Views: {`);
for (const [name, t] of tables) {
  if (t.kind === "r") continue;
  lines.push(`${ind(3)}${name}: {`);
  lines.push(`${ind(4)}Row: {`);
  for (const c of t.cols) lines.push(`${ind(5)}${c.col}: ${colType(c)} | null;`);
  lines.push(`${ind(4)}};`);
  lines.push(`${ind(4)}Relationships: [];`);
  lines.push(`${ind(3)}};`);
}
lines.push(`${ind(2)}};`);

// Functions: overloads become a union of argument shapes.
const byName = new Map();
for (const f of functions) {
  if (!byName.has(f.name)) byName.set(f.name, []);
  byName.get(f.name).push(f);
}
lines.push(`${ind(2)}Functions: {`);
for (const [name, overloads] of byName) {
  const argShapes = [];
  let returns = "unknown";
  for (const f of overloads) {
    const modes = f.argmodes.length ? f.argmodes : f.argtypes.map(() => "i");
    const inputs = [], outputs = [];
    f.argtypes.forEach((type, i) => {
      const argName = f.argnames[i] || `arg${i}`;
      const mode = modes[i];
      if (mode === "i" || mode === "b" || mode === "v") inputs.push({ name: argName, type });
      if (mode === "o" || mode === "b" || mode === "t") outputs.push({ name: argName, type });
    });
    const firstOptional = inputs.length - f.ndefaults;
    argShapes.push(inputs.length === 0 ? "Record<PropertyKey, never>"
      : `{ ${inputs.map((a, i) => `${a.name}${i >= firstOptional ? "?" : ""}: ${tsType(a.type)} | null`).join("; ")} }`);
    if (outputs.length && (f.setof || modes.includes("t"))) returns = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.type)}`).join("; ")} }[]`;
    else if (outputs.length) returns = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.type)}`).join("; ")} }`;
    else if (tables.has(f.ret.replace(/^public\./, ""))) {
      const rel = f.ret.replace(/^public\./, "");
      const group = tables.get(rel).kind === "r" ? "Tables" : "Views";
      returns = `Database["public"]["${group}"]["${rel}"]["Row"]${f.setof ? "[]" : ""}`;
    }
    else returns = f.setof ? `${tsType(f.ret)}[]` : tsType(f.ret);
  }
  lines.push(`${ind(3)}${name}: { Args: ${[...new Set(argShapes)].join(" | ")}; Returns: ${returns} };`);
}
lines.push(`${ind(2)}};`);
lines.push(`${ind(2)}Enums: Record<string, never>;`);
lines.push(`${ind(2)}CompositeTypes: Record<string, never>;`);
lines.push(`${ind(1)}};`);
lines.push("};");
lines.push("");
lines.push('export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];');
lines.push('export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];');
lines.push('export type Rpc<T extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][T]["Returns"];');
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(`Wrote ${OUT.pathname}: ${[...tables.values()].filter((t) => t.kind === "r").length} tables, ${[...tables.values()].filter((t) => t.kind !== "r").length} views, ${byName.size} functions.`);
