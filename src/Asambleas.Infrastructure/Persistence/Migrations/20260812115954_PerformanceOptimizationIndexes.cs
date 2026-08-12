using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asambleas.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PerformanceOptimizationIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_quorum_snapshots_AssemblyId_TimestampUtc",
                table: "quorum_snapshots",
                columns: new[] { "AssemblyId", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_communication_delivery_events_DeliveryId_OccurredAtUtc",
                table: "communication_delivery_events",
                columns: new[] { "DeliveryId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_assembly_representations_AssemblyId_RepresentativeUserId_IsActive",
                table: "assembly_representations",
                columns: new[] { "AssemblyId", "RepresentativeUserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_assemblies_PropertyHorizontalId_ScheduledAtUtc",
                table: "assemblies",
                columns: new[] { "PropertyHorizontalId", "ScheduledAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_assemblies_PropertyHorizontalId_Status_ScheduledAtUtc",
                table: "assemblies",
                columns: new[] { "PropertyHorizontalId", "Status", "ScheduledAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_quorum_snapshots_AssemblyId_TimestampUtc",
                table: "quorum_snapshots");

            migrationBuilder.DropIndex(
                name: "IX_communication_delivery_events_DeliveryId_OccurredAtUtc",
                table: "communication_delivery_events");

            migrationBuilder.DropIndex(
                name: "IX_assembly_representations_AssemblyId_RepresentativeUserId_IsActive",
                table: "assembly_representations");

            migrationBuilder.DropIndex(
                name: "IX_assemblies_PropertyHorizontalId_ScheduledAtUtc",
                table: "assemblies");

            migrationBuilder.DropIndex(
                name: "IX_assemblies_PropertyHorizontalId_Status_ScheduledAtUtc",
                table: "assemblies");
        }
    }
}
