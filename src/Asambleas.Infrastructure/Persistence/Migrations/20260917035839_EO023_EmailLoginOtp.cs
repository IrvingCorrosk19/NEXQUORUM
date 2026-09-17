using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO023_EmailLoginOtp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "email_login_challenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: true),
                    EmailNormalized = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CodeHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    LastSentAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReturnUrl = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    RequestIpHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_email_login_challenges", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_email_login_challenges_CodeHash",
                table: "email_login_challenges",
                column: "CodeHash");

            migrationBuilder.CreateIndex(
                name: "IX_email_login_challenges_EmailNormalized_ExpiresAtUtc",
                table: "email_login_challenges",
                columns: new[] { "EmailNormalized", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_email_login_challenges_TenantId",
                table: "email_login_challenges",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "email_login_challenges");
        }
    }
}
