DELETE FROM "AspNetUserTokens" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower('president@ocean.demo'));
DELETE FROM "AspNetUserLogins" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower('president@ocean.demo'));
DELETE FROM "AspNetUserClaims" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower('president@ocean.demo'));
DELETE FROM "AspNetUserRoles" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower('president@ocean.demo'));
DELETE FROM "AspNetUsers" WHERE lower("Email") <> lower('president@ocean.demo');

DELETE FROM "AspNetUserClaims" c
USING "AspNetUsers" u
WHERE c."UserId"=u."Id" AND lower(u."Email")=lower('president@ocean.demo')
  AND c."ClaimType" = 'property_horizontal_id';

INSERT INTO "AspNetRoles" ("Id","Name","NormalizedName","ConcurrencyStamp")
SELECT gen_random_uuid(), 'PlatformAdmin', 'PLATFORMADMIN', gen_random_uuid()::text
WHERE NOT EXISTS (SELECT 1 FROM "AspNetRoles" WHERE "NormalizedName"='PLATFORMADMIN');

DELETE FROM "AspNetUserRoles" ur
USING "AspNetUsers" u
WHERE ur."UserId"=u."Id" AND lower(u."Email")=lower('president@ocean.demo');

INSERT INTO "AspNetUserRoles" ("UserId","RoleId")
SELECT u."Id", r."Id"
FROM "AspNetUsers" u
CROSS JOIN "AspNetRoles" r
WHERE lower(u."Email")=lower('president@ocean.demo')
  AND r."NormalizedName"='PLATFORMADMIN';

UPDATE "AspNetUsers"
SET "DemoRole"='PlatformAdmin',
    "TenantId"='11111111-1111-1111-1111-111111111101'::uuid,
    "OrganizationId"='22222222-2222-2222-2222-222222222201'::uuid
WHERE lower("Email")=lower('president@ocean.demo');

DELETE FROM organizations WHERE "Id" <> '22222222-2222-2222-2222-222222222201'::uuid;
DELETE FROM tenants WHERE "Id" <> '11111111-1111-1111-1111-111111111101'::uuid;

INSERT INTO tenants ("Id","Code","Name","IsActive","CreatedAtUtc","UpdatedAtUtc")
SELECT '11111111-1111-1111-1111-111111111101'::uuid, 'PLATFORM', 'ASAMBLEAS Platform', TRUE, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE "Id"='11111111-1111-1111-1111-111111111101'::uuid);

INSERT INTO organizations ("Id","TenantId","Name","Code","CreatedAtUtc","UpdatedAtUtc")
SELECT '22222222-2222-2222-2222-222222222201'::uuid, '11111111-1111-1111-1111-111111111101'::uuid, 'ASAMBLEAS Platform Org', 'PLATFORM', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE "Id"='22222222-2222-2222-2222-222222222201'::uuid);

UPDATE tenants SET "Code"='PLATFORM', "Name"='ASAMBLEAS Platform', "IsActive"=TRUE, "UpdatedAtUtc"=NOW()
WHERE "Id"='11111111-1111-1111-1111-111111111101'::uuid;

UPDATE organizations SET "Name"='ASAMBLEAS Platform Org', "Code"='PLATFORM', "TenantId"='11111111-1111-1111-1111-111111111101'::uuid, "UpdatedAtUtc"=NOW()
WHERE "Id"='22222222-2222-2222-2222-222222222201'::uuid;