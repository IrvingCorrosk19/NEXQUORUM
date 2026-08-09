using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO008_AssemblyCalendarScheduling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssemblyKind",
                table: "assemblies",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CancelReason",
                table: "assemblies",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CancelledAtUtc",
                table: "assemblies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CancelledByUserId",
                table: "assemblies",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EstimatedEndAtUtc",
                table: "assemblies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "JoinWindowMinutesBefore",
                table: "assemblies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "LocationText",
                table: "assemblies",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "assemblies",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleVersion",
                table: "assemblies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "assembly_reminder_occurrences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReminderRuleId = table.Column<Guid>(type: "uuid", nullable: true),
                    OffsetHoursBeforeAssembly = table.Column<int>(type: "integer", nullable: false),
                    FireAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ScheduleVersion = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ChannelsJson = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    CancelledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CancelReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_reminder_occurrences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assembly_reminder_occurrences_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_assembly_reminder_occurrences_reminder_rules_ReminderRuleId",
                        column: x => x.ReminderRuleId,
                        principalTable: "reminder_rules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "assembly_schedule_changes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalScheduledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    OriginalEstimatedEndAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NewScheduledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NewEstimatedEndAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NotificationStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ImpactJson = table.Column<string>(type: "jsonb", nullable: false),
                    ScheduleVersionAfter = table.Column<int>(type: "integer", nullable: false),
                    ExpectedRowVersion = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_schedule_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assembly_schedule_changes_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assemblies_ScheduledAtUtc",
                table: "assemblies",
                column: "ScheduledAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_reminder_occurrences_AssemblyId",
                table: "assembly_reminder_occurrences",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_reminder_occurrences_AssemblyId_Status_FireAtUtc",
                table: "assembly_reminder_occurrences",
                columns: new[] { "AssemblyId", "Status", "FireAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_reminder_occurrences_ReminderRuleId",
                table: "assembly_reminder_occurrences",
                column: "ReminderRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_reminder_occurrences_TenantId",
                table: "assembly_reminder_occurrences",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_schedule_changes_AssemblyId",
                table: "assembly_schedule_changes",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_schedule_changes_ChangedAtUtc",
                table: "assembly_schedule_changes",
                column: "ChangedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_schedule_changes_TenantId",
                table: "assembly_schedule_changes",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assembly_reminder_occurrences");

            migrationBuilder.DropTable(
                name: "assembly_schedule_changes");

            migrationBuilder.DropIndex(
                name: "IX_assemblies_ScheduledAtUtc",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "AssemblyKind",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "CancelReason",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "CancelledAtUtc",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "CancelledByUserId",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "EstimatedEndAtUtc",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "JoinWindowMinutesBefore",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "LocationText",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "ScheduleVersion",
                table: "assemblies");
        }
    }
}
