using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO010_SessionRecordingEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "assembly_recordings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    MimeType = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChecksumSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RetentionUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ProviderEgressId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Provider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FailureReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    DisplayFileName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    RoomName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_recordings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assembly_recordings_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "property_recording_policies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordingEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    Mode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DownloadVisibility = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RetentionDays = table.Column<int>(type: "integer", nullable: false),
                    NoticeText = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    RequireNoticeAcknowledgement = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_property_recording_policies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_property_recording_policies_property_horizontals_PropertyHo~",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recording_notice_acceptances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AcceptedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NoticeVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClientUserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recording_notice_acceptances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_recording_notice_acceptances_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_recordings_AssemblyId_Active",
                table: "assembly_recordings",
                column: "AssemblyId",
                unique: true,
                filter: "\"Status\" IN ('Starting', 'Recording', 'Processing')");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_recordings_Status",
                table: "assembly_recordings",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_recordings_StorageKey",
                table: "assembly_recordings",
                column: "StorageKey");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_recordings_TenantId",
                table: "assembly_recordings",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_property_recording_policies_PropertyHorizontalId",
                table: "property_recording_policies",
                column: "PropertyHorizontalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_property_recording_policies_TenantId",
                table: "property_recording_policies",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_recording_notice_acceptances_AssemblyId",
                table: "recording_notice_acceptances",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_recording_notice_acceptances_AssemblyId_UserId_NoticeVersion",
                table: "recording_notice_acceptances",
                columns: new[] { "AssemblyId", "UserId", "NoticeVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_recording_notice_acceptances_TenantId",
                table: "recording_notice_acceptances",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_recording_notice_acceptances_UserId",
                table: "recording_notice_acceptances",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assembly_recordings");

            migrationBuilder.DropTable(
                name: "property_recording_policies");

            migrationBuilder.DropTable(
                name: "recording_notice_acceptances");
        }
    }
}
