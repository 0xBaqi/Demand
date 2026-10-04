param([ValidateSet('deploy','e2e','verify')][string]$Mode = 'deploy')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$previousNodeOptions = $env:NODE_OPTIONS
function Read-WalletKey([string]$Prompt) {
    $secureKey = Read-Host $Prompt -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
        if ($plainKey -notmatch '^(0x)?[a-fA-F0-9]{64}$') { throw 'Expected a 32-byte wallet private key. Input was not printed or saved.' }
        if (-not $plainKey.StartsWith('0x')) { $plainKey = '0x' + $plainKey }
        return $plainKey
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
        $secureKey.Dispose()
    }
}
try {
    $env:NODE_OPTIONS = (($previousNodeOptions + ' --use-system-ca').Trim())
    $env:USDG_ADDRESS = '0xFFC95faa3d63Cde504a05B567C600B78C0b41892'
    $env:EXPECTED_DEPLOYER_ADDRESS = '0xa11c20b7f5525468b0facaf6fe246c31f5eb912c'
    Remove-Item Env:DEPLOY_DEMO_TOKEN -ErrorAction SilentlyContinue
    if ($Mode -ne 'verify') {
        $env:DEPLOYER_PRIVATE_KEY = Read-WalletKey 'Enter funded testnet deployer key here locally (masked; never saved)'
    }
    if ($Mode -eq 'e2e') {
        $env:SUPPLIER_PRIVATE_KEY = Read-WalletKey 'Enter a DIFFERENT funded testnet supplier key here locally (masked; never saved)'
    }
    if ($Mode -eq 'deploy') {
        node scripts/deploy.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Deployment did not complete; check the public transaction record.' }
        npm.cmd run build
    }
    elseif ($Mode -eq 'e2e') { node scripts/e2e.mjs }
    else { node scripts/verify-deployment.mjs }
    if ($LASTEXITCODE -ne 0) { throw "$Mode did not complete. Public progress is saved when transactions were submitted." }
} finally {
    Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:SUPPLIER_PRIVATE_KEY -ErrorAction SilentlyContinue
    $env:NODE_OPTIONS = $previousNodeOptions
}
