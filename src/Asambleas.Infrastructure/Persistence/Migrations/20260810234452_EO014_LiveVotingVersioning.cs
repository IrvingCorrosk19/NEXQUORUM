using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO014_LiveVotingVersioning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CancellationReason",
                table: "voting_sessions",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CancelledAtUtc",
                table: "voting_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CancelledByUserId",
                table: "voting_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ConcurrencyStamp",
                table: "voting_sessions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "PreviousVotingSessionId",
                table: "voting_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RootVotingSessionId",
                table: "voting_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VersionNumber",
                table: "voting_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "ConcurrencyStamp",
                table: "motions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "PreviousMotionId",
                table: "motions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RootMotionId",
                table: "motions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VersionNumber",
                table: "motions",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_motions_PreviousMotionId",
                table: "motions",
                column: "PreviousMotionId");

            migrationBuilder.CreateIndex(
                name: "IX_motions_RootMotionId",
                table: "motions",
                column: "RootMotionId");

            migrationBuilder.AddForeignKey(
                name: "FK_motions_motions_PreviousMotionId",
                table: "motions",
                column: "PreviousMotionId",
                principalTable: "motions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_motions_motions_PreviousMotionId",
                table: "motions");

            migrationBuilder.DropIndex(
                name: "IX_motions_PreviousMotionId",
                table: "motions");

            migrationBuilder.DropIndex(
                name: "IX_motions_RootMotionId",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "CancellationReason",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "CancelledAtUtc",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "CancelledByUserId",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "ConcurrencyStamp",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "PreviousVotingSessionId",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "RootVotingSessionId",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "VersionNumber",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "ConcurrencyStamp",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "PreviousMotionId",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "RootMotionId",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "VersionNumber",
                table: "motions");
        }
    }
}
