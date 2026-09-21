# Build local de l'installeur NSIS (.exe) signé pour l'updater GitHub.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$keyPath = Join-Path $root "src-tauri\keys\comptal21.key"
$passwordFile = Join-Path $root "src-tauri\keys\password"
if (-not (Test-Path $keyPath)) {
  throw "Clé de signature introuvable: $keyPath"
}
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw -Path $keyPath).Trim()
if (Test-Path $passwordFile) {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -Raw -Path $passwordFile).Trim()
} else {
  # Clé générée sans mot de passe : le flag vide évite le prompt interactif.
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}
Set-Location $root
# npx (pas npm run) : npm sous Windows n'hérite pas toujours d'une variable d'environnement vide.
npx tauri build --bundles nsis
