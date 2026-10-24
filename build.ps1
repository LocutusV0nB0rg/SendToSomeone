# Packages the add-on into dist/send-to-someone.xpi
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Force dist | Out-Null
$xpi = "dist/send-to-someone-$version.xpi"
if (Test-Path $xpi) { Remove-Item $xpi }

# tar.exe (bsdtar, shipped with Windows) writes zip entries with forward slashes,
# which Thunderbird requires; Compress-Archive in PowerShell 5.1 does not.
# The zip format must be explicit: "-a" does not recognise the .xpi extension
# and would silently produce a tar archive.
& "$env:SystemRoot\System32\tar.exe" --format zip -c -f $xpi manifest.json background.js icons options
if ($LASTEXITCODE -ne 0) { throw "tar.exe failed with exit code $LASTEXITCODE" }
Write-Host "Built $xpi"
