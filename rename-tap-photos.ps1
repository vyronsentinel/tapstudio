$ErrorActionPreference = "Stop"

$incoming = Join-Path $PSScriptRoot "assets\incoming"
$assets = Join-Path $PSScriptRoot "assets"

$targetNames = @(
  "glam-red-full.jpg",
  "beauty-lavender.jpg",
  "group-glam.jpg",
  "graduation-green.jpg",
  "group-pink.jpg",
  "glam-red-closeup.jpg",
  "duo-striped.jpg"
)

if (!(Test-Path -LiteralPath $incoming)) {
  New-Item -ItemType Directory -Path $incoming | Out-Null
  Write-Host "Created $incoming. Put the 7 TAP Studio photos there, then run this script again."
  exit 0
}

$photos = Get-ChildItem -LiteralPath $incoming -File -Include *.jpg,*.jpeg,*.png,*.webp |
  Sort-Object Name

if ($photos.Count -lt $targetNames.Count) {
  Write-Host "Found $($photos.Count) photo(s). Put all 7 photos in $incoming, then run this script again."
  Write-Host "They will be assigned in alphabetical filename order."
  exit 1
}

for ($i = 0; $i -lt $targetNames.Count; $i++) {
  $destination = Join-Path $assets $targetNames[$i]
  Copy-Item -LiteralPath $photos[$i].FullName -Destination $destination -Force
  Write-Host "$($photos[$i].Name) -> $($targetNames[$i])"
}

Write-Host "Done. Refresh index.html in the browser."
