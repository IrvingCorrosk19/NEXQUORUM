using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Asambleas.Contracts.Recordings;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class RecordingExpedienteTests
{
    private readonly AsambleasFixture _fixture;

    public RecordingExpedienteTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Start_stop_download_recording_and_zip_package()
    {
        await _fixture.ResetDatabaseAsync();
        Environment.SetEnvironmentVariable("ASAMBLEAS_RECORDING_SYNTHETIC", "true");

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();
        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new Contracts.Assemblies.CheckInRequest(null, "Virtual")))
            .EnsureSuccessStatusCode();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new Contracts.Assemblies.CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual")))
            .EnsureSuccessStatusCode();
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start"))
            .EnsureSuccessStatusCode();

        var start = await president.PostAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/recording/start");
        start.StatusCode.Should().Be(HttpStatusCode.OK);
        var recording = await start.Content.ReadFromJsonAsync<AssemblyRecordingDto>();
        recording.Should().NotBeNull();

        if (recording!.Status is "Recording" or "Starting")
        {
            var stop = await president.PostAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/recording/{recording.Id}/stop");
            stop.EnsureSuccessStatusCode();
            recording = await stop.Content.ReadFromJsonAsync<AssemblyRecordingDto>();
        }

        if (recording!.Status is not "Ready")
        {
            var refreshed = await president.PostAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/recording/{recording.Id}/refresh");
            refreshed.EnsureSuccessStatusCode();
            recording = await refreshed.Content.ReadFromJsonAsync<AssemblyRecordingDto>();
        }

        recording!.Status.Should().Be("Ready");

        var download = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/recording/{recording.Id}/download");
        download.StatusCode.Should().Be(HttpStatusCode.OK);
        var bytes = await download.Content.ReadAsByteArrayAsync();
        bytes.Length.Should().BeGreaterThan(16);
        Convert.ToHexString(SHA256.HashData(bytes)).Should().NotBeNullOrWhiteSpace();

        var anon = _fixture.Factory.CreateClient();
        var anonGet = await anon.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/recording/{recording.Id}/download");
        anonGet.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.Redirect, HttpStatusCode.Found);

        var zip = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/expediente/package");
        zip.StatusCode.Should().Be(HttpStatusCode.OK);
        await using var zipStream = await zip.Content.ReadAsStreamAsync();
        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);
        archive.Entries.Select(e => e.FullName).Should().Contain(n => n.Contains("Manifest", StringComparison.OrdinalIgnoreCase));
        archive.Entries.Should().NotContain(e => e.FullName.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase));
    }
}
