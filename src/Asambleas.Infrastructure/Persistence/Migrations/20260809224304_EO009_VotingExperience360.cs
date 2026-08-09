using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO009_VotingExperience360 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_voting_sessions_AssemblyId",
                table: "voting_sessions");

            migrationBuilder.AddColumn<decimal>(
                name: "EligibleCoefficient",
                table: "voting_sessions",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "EligibleVoters",
                table: "voting_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "OpenedByUserId",
                table: "voting_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResultVisibilityPolicy",
                table: "voting_sessions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "HiddenUntilClose");

            migrationBuilder.CreateIndex(
                name: "IX_voting_sessions_AssemblyId",
                table: "voting_sessions",
                column: "AssemblyId");

            migrationBuilder.CreateTable(
                name: "voting_eligibility_snapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    VotingSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    CoefficientPercent = table.Column<decimal>(type: "numeric(7,4)", precision: 7, scale: 4, nullable: false),
                    UnitCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_voting_eligibility_snapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_voting_eligibility_snapshots_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_voting_eligibility_snapshots_voting_sessions_VotingSessionId",
                        column: x => x.VotingSessionId,
                        principalTable: "voting_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_voting_sessions_AssemblyId_Open",
                table: "voting_sessions",
                column: "AssemblyId",
                unique: true,
                filter: "\"Status\" = 'Open'");

            migrationBuilder.CreateIndex(
                name: "IX_voting_eligibility_snapshots_AssemblyId",
                table: "voting_eligibility_snapshots",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_voting_eligibility_snapshots_TenantId",
                table: "voting_eligibility_snapshots",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_voting_eligibility_snapshots_VotingSessionId",
                table: "voting_eligibility_snapshots",
                column: "VotingSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_voting_eligibility_snapshots_VotingSessionId_UserId",
                table: "voting_eligibility_snapshots",
                columns: new[] { "VotingSessionId", "UserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "voting_eligibility_snapshots");

            migrationBuilder.DropIndex(
                name: "IX_voting_sessions_AssemblyId_Open",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "EligibleCoefficient",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "EligibleVoters",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "OpenedByUserId",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "ResultVisibilityPolicy",
                table: "voting_sessions");

            migrationBuilder.CreateIndex(
                name: "IX_voting_sessions_AssemblyId",
                table: "voting_sessions",
                column: "AssemblyId");
        }
    }
}
