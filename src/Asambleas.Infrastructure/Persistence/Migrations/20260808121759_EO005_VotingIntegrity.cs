using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO005_VotingIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AppliedDecisionRule",
                table: "voting_sessions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DecisionStatus",
                table: "voting_sessions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientRequestId",
                table: "votes",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_votes_VotingSessionId_ClientRequestId",
                table: "votes",
                columns: new[] { "VotingSessionId", "ClientRequestId" },
                unique: true,
                filter: "\"ClientRequestId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_votes_VotingSessionId_ClientRequestId",
                table: "votes");

            migrationBuilder.DropColumn(
                name: "AppliedDecisionRule",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "DecisionStatus",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                table: "votes");
        }
    }
}
