/**
 * Prepares local Lucia / PH Nav Perf Alpha data for owner portal Home CTAs.
 *
 * Usage:
 *   node tools/e2e/_seed-owner-home-states.mjs empty
 *   node tools/e2e/_seed-owner-home-states.mjs upcoming
 *   node tools/e2e/_seed-owner-home-states.mjs live
 */
import pg from "pg";

const mode = String(process.argv[2] || "").toLowerCase();
if (!["empty", "upcoming", "live"].includes(mode)) {
  console.error("Usage: node tools/e2e/_seed-owner-home-states.mjs <empty|upcoming|live>");
  process.exit(1);
}

const PH = "d2f6ab6e-1d6e-4262-995f-5592b4ead1a7";
const client = new pg.Client({
  host: "127.0.0.1",
  port: 5432,
  database: "asambleas",
  user: "postgres",
  password: "Panama2020$"
});

await client.connect();

const userRes = await client.query(
  `SELECT "Id", "Email", "TenantId" FROM "AspNetUsers" WHERE "Email" ILIKE 'lucia.mendez@ocean.demo' LIMIT 1`
);
const user = userRes.rows[0];
if (!user) throw new Error("Lucia user not found");

const asms = await client.query(
  `SELECT "Id","Title","Status","ScheduledAtUtc"
   FROM assemblies
   WHERE "PropertyHorizontalId" = $1
   ORDER BY "ScheduledAtUtc" DESC`,
  [PH]
);
if (!asms.rows.length) throw new Error("No assemblies for PH");

const primary = asms.rows[0];
const others = asms.rows.slice(1).map((r) => r.Id);

// Ensure Lucia participates in the primary assembly.
const part = await client.query(
  `SELECT "Id" FROM assembly_participants WHERE "AssemblyId" = $1 AND "UserId" = $2`,
  [primary.Id, user.Id]
);
if (!part.rows[0]) {
  await client.query(
    `INSERT INTO assembly_participants
      ("Id","TenantId","AssemblyId","UserId","DisplayName","RoleCode","AttendanceStatus","CreatedAtUtc","UpdatedAtUtc","IsAccredited")
     VALUES (gen_random_uuid(), $1, $2, $3, 'Lucía Méndez', 'Owner', 'Invited', NOW(), NOW(), true)`,
    [user.TenantId, primary.Id, user.Id]
  );
}

if (others.length) {
  await client.query(
    `UPDATE assemblies
     SET "Status" = 5, "UpdatedAtUtc" = NOW()
     WHERE "Id" = ANY($1::uuid[]) AND "Status"::text IN ('0','1','2','3','4','Draft','Scheduled','CheckIn','InProgress','Paused')`,
    [others]
  );
}

if (mode === "empty") {
  await client.query(
    `UPDATE assemblies
     SET "Status" = 5, "ScheduledAtUtc" = NOW() - interval '7 days', "UpdatedAtUtc" = NOW()
     WHERE "Id" = $1`,
    [primary.Id]
  );
} else if (mode === "upcoming") {
  await client.query(
    `UPDATE assemblies
     SET "Status" = 1,
         "ScheduledAtUtc" = NOW() + interval '2 days',
         "JoinWindowMinutesBefore" = 30,
         "UpdatedAtUtc" = NOW()
     WHERE "Id" = $1`,
    [primary.Id]
  );
} else {
  await client.query(
    `UPDATE assemblies
     SET "Status" = 3,
         "ScheduledAtUtc" = NOW() - interval '15 minutes',
         "JoinWindowMinutesBefore" = 60,
         "UpdatedAtUtc" = NOW()
     WHERE "Id" = $1`,
    [primary.Id]
  );
}

const row = await client.query(
  `SELECT "Id","Title","Status","ScheduledAtUtc" FROM assemblies WHERE "Id" = $1`,
  [primary.Id]
);
await client.end();
console.log(JSON.stringify({ mode, primary: row.rows[0], completedOthers: others.length }, null, 2));
