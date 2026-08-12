using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO016_AssemblyAccessLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "assembly_access_links",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    DeliveryId = table.Column<Guid>(type: "uuid", nullable: true),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastUsedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_access_links", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_AssemblyId",
                table: "assembly_access_links",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_ConvocationId",
                table: "assembly_access_links",
                column: "ConvocationId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_ConvocationId_RecipientId",
                table: "assembly_access_links",
                columns: new[] { "ConvocationId", "RecipientId" });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_RecipientId",
                table: "assembly_access_links",
                column: "RecipientId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_TenantId",
                table: "assembly_access_links",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_access_links_TokenHash",
                table: "assembly_access_links",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assembly_access_links");
        }
    }
}
