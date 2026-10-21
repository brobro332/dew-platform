$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " 🌱 Dew Platform Verification Harness" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

Write-Host "`n[1/4] Checking Docker container status & port bindings..." -ForegroundColor Yellow
docker compose ps

Write-Host "`n[2/4] Running Backend Unit & API Harness Tests (test_harness.py)..." -ForegroundColor Yellow
docker exec dew-backend python -m unittest discover -s tests -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) {
    throw "Backend harness unit tests failed!"
}

Write-Host "`n[3/4] Checking Backend Live API (:8000/health & /api/news/daily)..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://localhost:8000/health"
Write-Host "Backend Health: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green

$daily = Invoke-RestMethod -Uri "http://localhost:8000/api/news/daily"
Write-Host "Daily News Count: $($daily.Count)" -ForegroundColor Green

Write-Host "`n[4/4] Checking Frontend HTTP status (:3000)..." -ForegroundColor Yellow
$fe = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
Write-Host "Frontend HTTP Status: $($fe.StatusCode)" -ForegroundColor Green

Write-Host "`n✅ All Dew Platform Harness checks passed!" -ForegroundColor Green
