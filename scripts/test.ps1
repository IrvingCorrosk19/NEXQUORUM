$ErrorActionPreference = "Stop"
$env:ASPNETCORE_ENVIRONMENT = "Development"
if (-not $env:ASAMBLEAS_TEST_CONNECTION) {
  if (-not $env:PGPASSWORD) { throw "Set PGPASSWORD or ASAMBLEAS_TEST_CONNECTION" }
  $env:ASAMBLEAS_TEST_CONNECTION = "Host=127.0.0.1;Port=5432;Database=asambleas_tests;Username=postgres;Password=$($env:PGPASSWORD)"
}
$env:ConnectionStrings__DefaultConnection = $env:ASAMBLEAS_TEST_CONNECTION
Set-Location $PSScriptRoot\..
dotnet test tests\Asambleas.UnitTests --no-restore
dotnet test tests\Asambleas.ArchitectureTests --no-restore
dotnet test tests\Asambleas.IntegrationTests
dotnet test tests\Asambleas.SecurityTests
dotnet test tests\Asambleas.E2ETests
