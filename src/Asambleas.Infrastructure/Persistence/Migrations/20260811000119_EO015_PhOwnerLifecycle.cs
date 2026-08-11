using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO015_PhOwnerLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ConcurrencyStamp",
                table: "property_horizontals",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "StatusBeforeDeactivate",
                table: "property_horizontals",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConcurrencyStamp",
                table: "owners",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "RegisteredPropertyHorizontalId",
                table: "owners",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_owners_RegisteredPropertyHorizontalId",
                table: "owners",
                column: "RegisteredPropertyHorizontalId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_owners_RegisteredPropertyHorizontalId",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "ConcurrencyStamp",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "StatusBeforeDeactivate",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "ConcurrencyStamp",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "RegisteredPropertyHorizontalId",
                table: "owners");
        }
    }
}
