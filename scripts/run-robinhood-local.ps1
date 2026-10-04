param([ValidateSet('deploy','verify')][string]$Mode = 'deploy')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$previousNodeOptions = $env:NODE_OPTIONS
$secureKey = $null
$keyPointer = [IntPtr]::Zero
$plainKey = $null
try {
    $env:NODE_OPTIONS = (($previousNodeOptions + ' --use-system-ca').Trim())
    if ($Mode -eq 'deploy' -and -not (Test-Path -LiteralPath 'deployment-robinhood.json')) {
        $secureKey = Read-Host 'Enter Robinhood-funded deployer key locally (masked; never saved)' -AsSecureString
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
        if ($plainKey -notmatch '^(0x)?[a-fA-F0-9]{64}$') { throw 'Invalid key format. Input was not printed or saved.' }
        if (-not $plainKey.StartsWith('0x')) { $plainKey = '0x' + $plainKey }
        $env:DEPLOYER_PRIVATE_KEY = $plainKey
        $plainKey = $null
    }
    node scripts/robinhood-deployment.mjs $Mode
    if ($LASTEXITCODE -ne 0) { throw 'Robinhood deployment/verification stopped. Do not proceed to frontend setup.' }
} finally {
    Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue
    $plainKey = $null
    if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
    if ($secureKey) { $secureKey.Dispose() }
    $env:NODE_OPTIONS = $previousNodeOptions
}
