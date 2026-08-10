using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO011_PhOwnerOnboarding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Floor",
                table: "units",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "units",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Tower",
                table: "units",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UnitType",
                table: "units",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "property_horizontals",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AdminEmail",
                table: "property_horizontals",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "property_horizontals",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "property_horizontals",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LegalName",
                table: "property_horizontals",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OnboardingStep",
                table: "property_horizontals",
                type: "integer",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "property_horizontals",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StateProvince",
                table: "property_horizontals",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "property_horizontals",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EffectiveFromUtc",
                table: "ownerships",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc)));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EffectiveToUtc",
                table: "ownerships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "ownerships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "owners",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Identification",
                table: "owners",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdentificationType",
                table: "owners",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                table: "owners",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "owners",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "owners",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.CreateTable(
                name: "owner_invitations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsumedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_invitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_owner_invitations_owners_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "owners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_owner_invitations_property_horizontals_PropertyHorizontalId",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_property_memberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleHint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_property_memberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_user_property_memberships_property_horizontals_PropertyHori~",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_owners_TenantId_IdentificationType_Identification",
                table: "owners",
                columns: new[] { "TenantId", "IdentificationType", "Identification" });

            migrationBuilder.CreateIndex(
                name: "IX_owner_invitations_OwnerId",
                table: "owner_invitations",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_owner_invitations_PropertyHorizontalId_Email",
                table: "owner_invitations",
                columns: new[] { "PropertyHorizontalId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_owner_invitations_TenantId",
                table: "owner_invitations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_owner_invitations_TokenHash",
                table: "owner_invitations",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_property_memberships_PropertyHorizontalId",
                table: "user_property_memberships",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_user_property_memberships_TenantId",
                table: "user_property_memberships",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_user_property_memberships_UserId",
                table: "user_property_memberships",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_user_property_memberships_UserId_PropertyHorizontalId",
                table: "user_property_memberships",
                columns: new[] { "UserId", "PropertyHorizontalId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "owner_invitations");

            migrationBuilder.DropTable(
                name: "user_property_memberships");

            migrationBuilder.DropIndex(
                name: "IX_owners_TenantId_IdentificationType_Identification",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "Floor",
                table: "units");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "units");

            migrationBuilder.DropColumn(
                name: "Tower",
                table: "units");

            migrationBuilder.DropColumn(
                name: "UnitType",
                table: "units");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "AdminEmail",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "City",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "LegalName",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "OnboardingStep",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "StateProvince",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "property_horizontals");

            migrationBuilder.DropColumn(
                name: "EffectiveFromUtc",
                table: "ownerships");

            migrationBuilder.DropColumn(
                name: "EffectiveToUtc",
                table: "ownerships");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "ownerships");

            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "Identification",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "IdentificationType",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "LastName",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "owners");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "owners");
        }
    }
}
