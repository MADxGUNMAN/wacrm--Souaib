$files = Get-ChildItem -Path "src/app/api" -Recurse -Include "*.ts","*.tsx"
foreach ($f in $files) {
    $c = [System.IO.File]::ReadAllText($f.FullName)
    if ($c.Contains("requireRole('agent')")) {
        $c = $c.Replace("requireRole('agent')", "requireRole('member')")
        [System.IO.File]::WriteAllText($f.FullName, $c)
        Write-Host ("Updated: " + $f.Name)
    }
}
