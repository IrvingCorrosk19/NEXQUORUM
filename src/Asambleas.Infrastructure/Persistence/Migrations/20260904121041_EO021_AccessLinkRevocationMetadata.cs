using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO021_AccessLinkRevocationMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_assembly_access_links_ConvocationId_RecipientId",
                table: "assembly_access_links");

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacedByLinkId",
                table: "assembly_access_links",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RevocationReason",
                table: "assembly_access_links",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            // Collapse legacy duplicate active links before unique filtered index.
            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT "Id",
                           ROW_NUMBER() OVER (
                               PARTITION BY "ConvocationId", "RecipientId"
                               ORDER BY "CreatedAtUtc" DESC, "Id" DESC) AS rn
                    FROM assembly_access_links
                    WHERE "RevokedAtUtc" IS NULL
                )
                UPDATE assembly_access_links AS a
                SET "RevokedAtUtc" = NOW() AT TIME ZONE 'utc',
                    "RevocationReason" = COALESCE(a."RevocationReason", 'Replaced')
                FROM ranked AS r
                WHERE a."Id" = r."Id" AND r.rn > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_active_recipient",
                table: "assembly_access_links",
                columns: new[] { "ConvocationId", "RecipientId" },
                unique: true,
                filter: "\"RevokedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_ConvocationId_RecipientId",
                table: "assembly_access_links",
                columns: new[] { "ConvocationId", "RecipientId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_assembly_access_links_active_recipient",
                table: "assembly_access_links");

            migrationBuilder.DropColumn(
                name: "ReplacedByLinkId",
                table: "assembly_access_links");

            migrationBuilder.DropColumn(
                name: "RevocationReason",
                table: "assembly_access_links");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_ConvocationId_RecipientId",
                table: "assembly_access_links",
                columns: new[] { "ConvocationId", "RecipientId" });
        }
    }
}
