/**
 * One-time backfill: enroll convocation recipients (with UserId) as assembly_participants
 * for convocations already in Sent/Partial/Failed status.
 * READ/WRITE — run once after deploying convocation enrollment fix.
 */
const { Client } = require("pg");
const { randomUUID } = require("crypto");

const c = new Client({
  host: "127.0.0.1",
  port: 5432,
  database: "asambleas",
  user: "postgres",
  password: "Panama2020$",
});

async function main() {
  await c.connect();

  const convocations = await c.query(`
    SELECT c."Id", c."AssemblyId", c."TenantId", c."PropertyHorizontalId", c."Status"
    FROM convocations c
    WHERE c."Status" IN ('Sent', 'Partial', 'Failed')
  `);

  let inserted = 0;
  let skipped = 0;

  for (const conv of convocations.rows) {
    const recipients = await c.query(
      `SELECT "Id", "OwnerId", "UserId", "DisplayName", "IsValid"
       FROM convocation_recipients
       WHERE "ConvocationId" = $1 AND "UserId" IS NOT NULL AND "IsValid" = true`,
      [conv.Id]
    );

    for (const r of recipients.rows) {
      const exists = await c.query(
        `SELECT 1 FROM assembly_participants
         WHERE "AssemblyId" = $1 AND "UserId" = $2 LIMIT 1`,
        [conv.AssemblyId, r.UserId]
      );
      if (exists.rowCount > 0) {
        skipped++;
        continue;
      }

      let unitId = null;
      if (r.OwnerId) {
        const unit = await c.query(
          `SELECT o."UnitId"
           FROM ownerships o
           JOIN units u ON u."Id" = o."UnitId"
           WHERE o."OwnerId" = $1 AND o."IsActive" = true
             AND u."PropertyHorizontalId" = $2
           ORDER BY o."SharePercent" DESC
           LIMIT 1`,
          [r.OwnerId, conv.PropertyHorizontalId]
        );
        unitId = unit.rows[0]?.UnitId ?? null;
      }

      const now = new Date().toISOString();
      await c.query(
        `INSERT INTO assembly_participants
          ("Id", "TenantId", "AssemblyId", "UserId", "UnitId", "DisplayName", "RoleCode",
           "AttendanceStatus", "IsAccredited", "EffectiveCoefficientPercent", "CreatedAtUtc", "UpdatedAtUtc")
         VALUES ($1, $2, $3, $4, $5, $6, 'Owner', 'Registered', false, 0, $7, $7)`,
        [
          randomUUID(),
          conv.TenantId,
          conv.AssemblyId,
          r.UserId,
          unitId,
          (r.DisplayName || "Propietario").trim(),
          now,
        ]
      );
      inserted++;
      console.log("enrolled", r.DisplayName, r.UserId, "assembly", conv.AssemblyId);
    }
  }

  console.log(JSON.stringify({ convocations: convocations.rowCount, inserted, skipped }, null, 2));
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
