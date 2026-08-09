$ErrorActionPreference = "Stop"
$base = "http://localhost:5188"
$assemblyId = "44444444-4444-4444-4444-444444444401"
$motionId = "99999999-9999-9999-9999-999999999001"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:afToken = ""

function RefreshAf {
  $r = Invoke-WebRequest -Uri "$base/api/auth/antiforgery" -Method GET -WebSession $session -UseBasicParsing
  $script:afToken = ($r.Content | ConvertFrom-Json).requestToken
}

function Login([string]$email) {
  RefreshAf
  $null = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" `
    -Headers @{ RequestVerificationToken = $script:afToken } `
    -Body (@{ email = $email; password = "Demo!Pass123" } | ConvertTo-Json) -WebSession $session -UseBasicParsing
  RefreshAf
}

function Api([string]$method, [string]$path, $body = $null) {
  if ($method -ne "GET") { RefreshAf }
  $headers = @{}
  if ($method -ne "GET") { $headers["RequestVerificationToken"] = $script:afToken }
  $params = @{
    Uri             = "$base$path"
    Method          = $method
    WebSession      = $session
    UseBasicParsing = $true
    Headers         = $headers
  }
  if ($null -ne $body) {
    $params.ContentType = "application/json"
    $params.Body = ($body | ConvertTo-Json -Depth 8 -Compress)
  }
  try {
    $r = Invoke-WebRequest @params
    return @{ ok = $true; status = [int]$r.StatusCode; json = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }; raw = $r.Content }
  }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $raw = $reader.ReadToEnd()
    return @{ ok = $false; status = [int]$resp.StatusCode; json = $null; raw = $raw }
  }
}

Login "president@ocean.demo"
$r = Api "POST" "/api/assemblies/$assemblyId/start-checkin"
Write-Output "START_CHECKIN $($r.status) ok=$($r.ok) $($r.raw)"

$owners = @(
  @{ e = "owner101@ocean.demo"; u = "55555555-5555-5555-5555-555555555101" },
  @{ e = "owner102@ocean.demo"; u = "55555555-5555-5555-5555-555555555102" },
  @{ e = "owner103@ocean.demo"; u = "55555555-5555-5555-5555-555555555103" },
  @{ e = "owner104@ocean.demo"; u = "55555555-5555-5555-5555-555555555104" },
  @{ e = "owner105@ocean.demo"; u = "55555555-5555-5555-5555-555555555105" },
  @{ e = "owner106@ocean.demo"; u = "55555555-5555-5555-5555-555555555106" }
)

foreach ($o in $owners) {
  Login $o.e
  $r = Api "POST" "/api/assemblies/$assemblyId/attendance/check-in" @{ unitId = $o.u; presenceType = "Virtual" }
  Write-Output "CHECKIN $($o.e) $($r.status) ok=$($r.ok)"
}

# also operators check-in optional
Login "president@ocean.demo"
$r = Api "POST" "/api/assemblies/$assemblyId/start"
Write-Output "START $($r.status) ok=$($r.ok) $($r.raw)"

$q = Api "GET" "/api/assemblies/$assemblyId/quorum/latest"
Write-Output "QUORUM $($q.raw)"

Login "owner103@ocean.demo"
$spk = Api "POST" "/api/assemblies/$assemblyId/speakers/request" @{}
Write-Output "SPEAK ok=$($spk.ok) $($spk.raw)"
Login "president@ocean.demo"
$grant = Api "POST" "/api/assemblies/$assemblyId/speakers/$($spk.json.id)/grant"
Write-Output "GRANT $($grant.status)"
$done = Api "POST" "/api/assemblies/$assemblyId/speakers/$($spk.json.id)/complete"
Write-Output "COMPLETE_SPEAK $($done.status)"

$pres = Api "POST" "/api/assemblies/$assemblyId/motions/present" @{ motionId = $motionId }
Write-Output "PRESENT $($pres.status) ok=$($pres.ok)"

$open = Api "POST" "/api/assemblies/$assemblyId/voting/open" @{ motionId = $motionId; hidePartialResults = $false }
Write-Output "OPEN $($open.status) ok=$($open.ok) $($open.raw)"
$vsId = $open.json.id

foreach ($o in $owners) {
  Login $o.e
  $v = Api "POST" "/api/assemblies/$assemblyId/voting/$vsId/cast" @{ choice = "InFavor"; unitId = $o.u }
  Write-Output "VOTE $($o.e) $($v.status) ok=$($v.ok)"
}

Login "president@ocean.demo"
$close = Api "POST" "/api/assemblies/$assemblyId/voting/$vsId/close"
Write-Output "CLOSE $($close.raw)"

$mins = Api "GET" "/api/assemblies/$assemblyId/minutes"
Write-Output "MINUTES status=$($mins.status) hash=$($mins.json.contentHash) sections=$($mins.json.sections.Count)"

$ev = Api "GET" "/api/assemblies/$assemblyId/evidence"
Write-Output "EVIDENCE status=$($ev.status)"

$end = Api "POST" "/api/assemblies/$assemblyId/complete"
Write-Output "END $($end.status) ok=$($end.ok) $($end.raw)"
