using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO006_AttendanceRepresentation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Reason",
                table: "quorum_snapshots",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AccreditedAtUtc",
                table: "assembly_participants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AccreditedByUserId",
                table: "assembly_participants",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EffectiveCoefficientPercent",
                table: "assembly_participants",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsAccredited",
                table: "assembly_participants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PresenceType",
                table: "assembly_participants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "powers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrincipalOwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    RepresentativeUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    ValidatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ValidatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_powers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_powers_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_powers_owners_PrincipalOwnerId",
                        column: x => x.PrincipalOwnerId,
                        principalTable: "owners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_powers_units_UnitId",
                        column: x => x.UnitId,
                        principalTable: "units",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "assembly_representations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    RepresentativeUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PowerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CoefficientSnapshot = table.Column<decimal>(type: "numeric(7,4)", precision: 7, scale: 4, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AccreditedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AccreditedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_representations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assembly_representations_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_assembly_representations_powers_PowerId",
                        column: x => x.PowerId,
                        principalTable: "powers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_assembly_representations_units_UnitId",
                        column: x => x.UnitId,
                        principalTable: "units",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_participants_IsAccredited",
                table: "assembly_participants",
                column: "IsAccredited");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_AssemblyId",
                table: "assembly_representations",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_AssemblyId_UnitId",
                table: "assembly_representations",
                columns: new[] { "AssemblyId", "UnitId" },
                unique: true,
                filter: "\"IsActive\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_PowerId",
                table: "assembly_representations",
                column: "PowerId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_RepresentativeUserId",
                table: "assembly_representations",
                column: "RepresentativeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_TenantId",
                table: "assembly_representations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_UnitId",
                table: "assembly_representations",
                column: "UnitId");

            migrationBuilder.CreateIndex(
                name: "IX_powers_AssemblyId",
                table: "powers",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_powers_AssemblyId_UnitId_Status",
                table: "powers",
                columns: new[] { "AssemblyId", "UnitId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_powers_PrincipalOwnerId",
                table: "powers",
                column: "PrincipalOwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_powers_RepresentativeUserId",
                table: "powers",
                column: "RepresentativeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_powers_TenantId",
                table: "powers",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_powers_UnitId",
                table: "powers",
                column: "UnitId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assembly_representations");

            migrationBuilder.DropTable(
                name: "powers");

            migrationBuilder.DropIndex(
                name: "IX_assembly_participants_IsAccredited",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "Reason",
                table: "quorum_snapshots");

            migrationBuilder.DropColumn(
                name: "AccreditedAtUtc",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "AccreditedByUserId",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "EffectiveCoefficientPercent",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "IsAccredited",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "PresenceType",
                table: "assembly_participants");
        }
    }
}
