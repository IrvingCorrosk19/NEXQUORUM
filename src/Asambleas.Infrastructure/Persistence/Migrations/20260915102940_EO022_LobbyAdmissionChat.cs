using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO022_LobbyAdmissionChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RoomEntryRejectReason",
                table: "assembly_participants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RoomEntryRequestedAtUtc",
                table: "assembly_participants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RoomEntryStatus",
                table: "assembly_participants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "assembly_chat_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorDisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    IsPinned = table.Column<bool>(type: "boolean", nullable: false),
                    IsRemoved = table.Column<bool>(type: "boolean", nullable: false),
                    RemovedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RemovedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assembly_chat_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assembly_chat_messages_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_chat_messages_AssemblyId",
                table: "assembly_chat_messages",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_assembly_chat_messages_AssemblyId_CreatedAtUtc",
                table: "assembly_chat_messages",
                columns: new[] { "AssemblyId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_chat_messages_TenantId",
                table: "assembly_chat_messages",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assembly_chat_messages");

            migrationBuilder.DropColumn(
                name: "RoomEntryRejectReason",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "RoomEntryRequestedAtUtc",
                table: "assembly_participants");

            migrationBuilder.DropColumn(
                name: "RoomEntryStatus",
                table: "assembly_participants");
        }
    }
}
