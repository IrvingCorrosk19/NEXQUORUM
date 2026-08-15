using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO018_MotionDisplayOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "motions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                WITH ordered AS (
                  SELECT "Id",
                         ROW_NUMBER() OVER (PARTITION BY "AssemblyId" ORDER BY "CreatedAtUtc", "Code") AS rn
                  FROM motions
                )
                UPDATE motions m
                SET "DisplayOrder" = ordered.rn
                FROM ordered
                WHERE m."Id" = ordered."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_motions_AssemblyId_DisplayOrder",
                table: "motions",
                columns: new[] { "AssemblyId", "DisplayOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_motions_AssemblyId_DisplayOrder",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "motions");
        }
    }
}
