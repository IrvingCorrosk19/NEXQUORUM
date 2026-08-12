using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO017_AssemblyHistoricalSeal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EligibleUnits",
                table: "quorum_snapshots",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SealedAtUtc",
                table: "assemblies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SealedMinutesDocumentId",
                table: "assemblies",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SealedMinutesHash",
                table: "assemblies",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SealedMinutesJson",
                table: "assemblies",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EligibleUnits",
                table: "quorum_snapshots");

            migrationBuilder.DropColumn(
                name: "SealedAtUtc",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "SealedMinutesDocumentId",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "SealedMinutesHash",
                table: "assemblies");

            migrationBuilder.DropColumn(
                name: "SealedMinutesJson",
                table: "assemblies");
        }
    }
}
