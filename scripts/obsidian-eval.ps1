param([Parameter(Mandatory = $true)][string]$ScriptPath, [string]$Vault = '')
$source = Get-Content -LiteralPath $ScriptPath -Raw -Encoding UTF8
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
$argument = "code=eval(new TextDecoder().decode(Uint8Array.from(atob('$encoded'), c => c.charCodeAt(0))))"
# Keep long tests below the Windows CLI argument limit by reading their installed source.
if ($argument.Length -gt 6000) {
    $pluginRoot = (Split-Path -Parent $PSScriptRoot).TrimEnd('\') + '\'
    $sourcePath = (Resolve-Path -LiteralPath $ScriptPath).Path
    if (!$sourcePath.StartsWith($pluginRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Keep large test scripts inside the installed plugin directory.'
    }
    $relative = $sourcePath.Substring($pluginRoot.Length).Replace('\', '/')
    $encodedPath = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($relative))
    $argument = "code=app.vault.adapter.read(app.plugins.manifests['canvas-art-ref-plugin'].dir+'/'+new TextDecoder().decode(Uint8Array.from(atob('$encodedPath'), c => c.charCodeAt(0)))).then(source => eval(source))"
}
$cliArgs = @()
if ($Vault) { $cliArgs += 'vault=' + $Vault }
$cliArgs += @('eval', $argument)
& obsidian @cliArgs
