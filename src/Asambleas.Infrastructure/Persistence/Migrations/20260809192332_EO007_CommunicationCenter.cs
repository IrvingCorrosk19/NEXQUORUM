using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EO007_CommunicationCenter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "channel_configurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    Channel = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProviderType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    SettingsJson = table.Column<string>(type: "jsonb", nullable: false),
                    HasSecret = table.Column<bool>(type: "boolean", nullable: false),
                    SecretCiphertext = table.Column<string>(type: "text", nullable: true),
                    LastTestedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastTestSucceeded = table.Column<bool>(type: "boolean", nullable: true),
                    LastTestDetail = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_channel_configurations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_channel_configurations_property_horizontals_PropertyHorizon~",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "communication_profiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    SandboxMode = table.Column<bool>(type: "boolean", nullable: false),
                    TestRecipientOverride = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    DefaultTimezoneId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DefaultFromDisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DefaultReplyTo = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_communication_profiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_communication_profiles_property_horizontals_PropertyHorizon~",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "convocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    ChannelsJson = table.Column<string>(type: "jsonb", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: true),
                    Subject = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    BodyHtml = table.Column<string>(type: "text", nullable: false),
                    BodyText = table.Column<string>(type: "text", nullable: false),
                    ScheduledAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SentAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_convocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_convocations_assemblies_AssemblyId",
                        column: x => x.AssemblyId,
                        principalTable: "assemblies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_convocations_property_horizontals_PropertyHorizontalId",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "message_templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ChannelScope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Subject = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    BodyHtml = table.Column<string>(type: "text", nullable: false),
                    BodyText = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_templates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_message_templates_property_horizontals_PropertyHorizontalId",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "portal_notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    DeliveryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    ReadAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_portal_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_portal_notifications_property_horizontals_PropertyHorizonta~",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reminder_rules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PropertyHorizontalId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    OffsetHoursBeforeAssembly = table.Column<int>(type: "integer", nullable: false),
                    ChannelsJson = table.Column<string>(type: "jsonb", nullable: false),
                    ConditionsJson = table.Column<string>(type: "jsonb", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reminder_rules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_reminder_rules_property_horizontals_PropertyHorizontalId",
                        column: x => x.PropertyHorizontalId,
                        principalTable: "property_horizontals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "communication_batches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TotalCount = table.Column<int>(type: "integer", nullable: false),
                    SentCount = table.Column<int>(type: "integer", nullable: false),
                    DeliveredCount = table.Column<int>(type: "integer", nullable: false),
                    FailedCount = table.Column<int>(type: "integer", nullable: false),
                    SkippedCount = table.Column<int>(type: "integer", nullable: false),
                    StartedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_communication_batches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_communication_batches_convocations_ConvocationId",
                        column: x => x.ConvocationId,
                        principalTable: "convocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "convocation_recipients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    DisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    PhoneE164 = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ChannelsJson = table.Column<string>(type: "jsonb", nullable: false),
                    IsValid = table.Column<bool>(type: "boolean", nullable: false),
                    ValidationIssuesJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_convocation_recipients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_convocation_recipients_convocations_ConvocationId",
                        column: x => x.ConvocationId,
                        principalTable: "convocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "communication_deliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConvocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Channel = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProviderType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Destination = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    WasRedirectedToTestOverride = table.Column<bool>(type: "boolean", nullable: false),
                    ProviderMessageId = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ErrorDetail = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    QueuedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SentAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeliveredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReadAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextRetryAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_communication_deliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_communication_deliveries_communication_batches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "communication_batches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_communication_deliveries_convocation_recipients_RecipientId",
                        column: x => x.RecipientId,
                        principalTable: "convocation_recipients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "communication_delivery_events",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EventType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Detail = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProviderPayloadJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_communication_delivery_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_communication_delivery_events_communication_deliveries_Deli~",
                        column: x => x.DeliveryId,
                        principalTable: "communication_deliveries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_channel_configurations_PropertyHorizontalId",
                table: "channel_configurations",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_channel_configurations_TenantId",
                table: "channel_configurations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_channel_configurations_TenantId_PropertyHorizontalId_Channel",
                table: "channel_configurations",
                columns: new[] { "TenantId", "PropertyHorizontalId", "Channel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_communication_batches_ConvocationId",
                table: "communication_batches",
                column: "ConvocationId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_batches_TenantId",
                table: "communication_batches",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_batches_TenantId_IdempotencyKey",
                table: "communication_batches",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_BatchId",
                table: "communication_deliveries",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_BatchId_RecipientId_Channel",
                table: "communication_deliveries",
                columns: new[] { "BatchId", "RecipientId", "Channel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_ConvocationId",
                table: "communication_deliveries",
                column: "ConvocationId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_RecipientId",
                table: "communication_deliveries",
                column: "RecipientId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_Status",
                table: "communication_deliveries",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_communication_deliveries_TenantId",
                table: "communication_deliveries",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_delivery_events_DeliveryId",
                table: "communication_delivery_events",
                column: "DeliveryId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_delivery_events_TenantId",
                table: "communication_delivery_events",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_profiles_PropertyHorizontalId",
                table: "communication_profiles",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_profiles_TenantId",
                table: "communication_profiles",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_communication_profiles_TenantId_PropertyHorizontalId",
                table: "communication_profiles",
                columns: new[] { "TenantId", "PropertyHorizontalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_convocation_recipients_ConvocationId",
                table: "convocation_recipients",
                column: "ConvocationId");

            migrationBuilder.CreateIndex(
                name: "IX_convocation_recipients_ConvocationId_OwnerId",
                table: "convocation_recipients",
                columns: new[] { "ConvocationId", "OwnerId" },
                unique: true,
                filter: "\"OwnerId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_convocation_recipients_TenantId",
                table: "convocation_recipients",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_convocations_AssemblyId",
                table: "convocations",
                column: "AssemblyId");

            migrationBuilder.CreateIndex(
                name: "IX_convocations_PropertyHorizontalId",
                table: "convocations",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_convocations_TenantId",
                table: "convocations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_convocations_TenantId_IdempotencyKey",
                table: "convocations",
                columns: new[] { "TenantId", "IdempotencyKey" },
                unique: true,
                filter: "\"IdempotencyKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_message_templates_PropertyHorizontalId",
                table: "message_templates",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_message_templates_TenantId",
                table: "message_templates",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_message_templates_TenantId_PropertyHorizontalId_Code",
                table: "message_templates",
                columns: new[] { "TenantId", "PropertyHorizontalId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_portal_notifications_PropertyHorizontalId",
                table: "portal_notifications",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_portal_notifications_TenantId",
                table: "portal_notifications",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_portal_notifications_TenantId_UserId_IsRead",
                table: "portal_notifications",
                columns: new[] { "TenantId", "UserId", "IsRead" });

            migrationBuilder.CreateIndex(
                name: "IX_portal_notifications_UserId",
                table: "portal_notifications",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_reminder_rules_PropertyHorizontalId",
                table: "reminder_rules",
                column: "PropertyHorizontalId");

            migrationBuilder.CreateIndex(
                name: "IX_reminder_rules_TenantId",
                table: "reminder_rules",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "channel_configurations");

            migrationBuilder.DropTable(
                name: "communication_delivery_events");

            migrationBuilder.DropTable(
                name: "communication_profiles");

            migrationBuilder.DropTable(
                name: "message_templates");

            migrationBuilder.DropTable(
                name: "portal_notifications");

            migrationBuilder.DropTable(
                name: "reminder_rules");

            migrationBuilder.DropTable(
                name: "communication_deliveries");

            migrationBuilder.DropTable(
                name: "communication_batches");

            migrationBuilder.DropTable(
                name: "convocation_recipients");

            migrationBuilder.DropTable(
                name: "convocations");
        }
    }
}
