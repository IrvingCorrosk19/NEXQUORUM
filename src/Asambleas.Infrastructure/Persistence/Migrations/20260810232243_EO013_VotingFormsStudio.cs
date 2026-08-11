using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO013_VotingFormsStudio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BallotKind",
                table: "voting_sessions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "FavorAgainstAbstain");

            migrationBuilder.AddColumn<string>(
                name: "CalculationMethod",
                table: "voting_sessions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Coefficient");

            migrationBuilder.AddColumn<decimal>(
                name: "RequiredThresholdPercent",
                table: "voting_sessions",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RuleSnapshotJson",
                table: "voting_sessions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BallotKind",
                table: "motions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "FavorAgainstAbstain");

            migrationBuilder.AddColumn<string>(
                name: "CalculationMethod",
                table: "motions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Coefficient");

            migrationBuilder.AddColumn<string>(
                name: "DecisionRuleCode",
                table: "motions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "SimpleMajority");

            migrationBuilder.AddColumn<string>(
                name: "DefaultResultVisibilityPolicy",
                table: "motions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "HiddenUntilClose");

            migrationBuilder.AddColumn<string>(
                name: "DesignStatus",
                table: "motions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Draft");

            migrationBuilder.AddColumn<string>(
                name: "Instructions",
                table: "motions",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstrumentKind",
                table: "motions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "FormalVote");

            migrationBuilder.AddColumn<bool>(
                name: "IsSecret",
                table: "motions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "OptionsJson",
                table: "motions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QuestionText",
                table: "motions",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RequiredThresholdPercent",
                table: "motions",
                type: "numeric(7,4)",
                precision: 7,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TemplateKey",
                table: "motions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "survey_forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgendaItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PublishedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClosedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_survey_forms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_survey_forms_agenda_items_AgendaItemId",
                        column: x => x.AgendaItemId,
                        principalTable: "agenda_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_survey_forms_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "survey_questions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SurveyFormId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ordinal = table.Column<int>(type: "integer", nullable: false),
                    QuestionType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Title = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OptionsJson = table.Column<string>(type: "jsonb", nullable: true),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_survey_questions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_survey_questions_survey_forms_SurveyFormId",
                        column: x => x.SurveyFormId,
                        principalTable: "survey_forms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "survey_responses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    SurveyFormId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnswersJson = table.Column<string>(type: "jsonb", nullable: false),
                    SubmittedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ClientRequestId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_survey_responses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_survey_responses_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_survey_responses_survey_forms_SurveyFormId",
                        column: x => x.SurveyFormId,
                        principalTable: "survey_forms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_motions_DesignStatus",
                table: "motions",
                column: "DesignStatus");

            migrationBuilder.CreateIndex(
                name: "IX_survey_forms_AgendaItemId",
                table: "survey_forms",
                column: "AgendaItemId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_forms_AssemblyId",
                table: "survey_forms",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_forms_Status",
                table: "survey_forms",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_survey_forms_TenantId",
                table: "survey_forms",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_questions_SurveyFormId",
                table: "survey_questions",
                column: "SurveyFormId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_questions_SurveyFormId_Ordinal",
                table: "survey_questions",
                columns: new[] { "SurveyFormId", "Ordinal" });

            migrationBuilder.CreateIndex(
                name: "IX_survey_questions_TenantId",
                table: "survey_questions",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_responses_AssemblyId",
                table: "survey_responses",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_responses_SurveyFormId",
                table: "survey_responses",
                column: "SurveyFormId");

            migrationBuilder.CreateIndex(
                name: "IX_survey_responses_SurveyFormId_ClientRequestId",
                table: "survey_responses",
                columns: new[] { "SurveyFormId", "ClientRequestId" },
                unique: true,
                filter: "\"ClientRequestId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_survey_responses_SurveyFormId_UserId",
                table: "survey_responses",
                columns: new[] { "SurveyFormId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_survey_responses_TenantId",
                table: "survey_responses",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "survey_questions");

            migrationBuilder.DropTable(
                name: "survey_responses");

            migrationBuilder.DropTable(
                name: "survey_forms");

            migrationBuilder.DropIndex(
                name: "IX_motions_DesignStatus",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "BallotKind",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "CalculationMethod",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "RequiredThresholdPercent",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "RuleSnapshotJson",
                table: "voting_sessions");

            migrationBuilder.DropColumn(
                name: "BallotKind",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "CalculationMethod",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "DecisionRuleCode",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "DefaultResultVisibilityPolicy",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "DesignStatus",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "Instructions",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "InstrumentKind",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "IsSecret",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "OptionsJson",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "QuestionText",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "RequiredThresholdPercent",
                table: "motions");

            migrationBuilder.DropColumn(
                name: "TemplateKey",
                table: "motions");
        }
    }
}
