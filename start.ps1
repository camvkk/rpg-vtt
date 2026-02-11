# RPG VTT - Start Script
# Sobe server + client com um comando

Write-Host "🎲 Starting RPG VTT..." -ForegroundColor Yellow

# Kill any existing instances
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "rpg-vtt" -or $_.CommandLine -match "rpg-vtt"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Start server
Write-Host "📡 Starting server on port 3001..." -ForegroundColor Cyan
$server = Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow
Start-Sleep -Seconds 2

# Start client
Write-Host "🌐 Starting client on port 5173..." -ForegroundColor Cyan
$client = Start-Process -FilePath "node" -ArgumentList "node_modules/vite/bin/vite.js","--port","5173" -WorkingDirectory "$PSScriptRoot/client" -PassThru -NoNewWindow

Write-Host ""
Write-Host "✅ RPG VTT is running!" -ForegroundColor Green
Write-Host "   Server: http://localhost:3001" -ForegroundColor White
Write-Host "   Client: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop both." -ForegroundColor Gray

# Wait and cleanup
try {
    $server.WaitForExit()
} finally {
    if (!$client.HasExited) { $client.Kill() }
    if (!$server.HasExited) { $server.Kill() }
    Write-Host "🛑 RPG VTT stopped." -ForegroundColor Red
}
