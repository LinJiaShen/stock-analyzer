# StockVision API Test Script
$ErrorActionPreference = "Stop"
$base = "http://localhost:8000"
$pass = 0
$fail = 0

function Test-Endpoint {
    param([string]$label, [string]$path)
    Write-Host "[TEST] $label" -NoNewline -ForegroundColor Yellow
    try {
        $r = Invoke-RestMethod -Uri "$base$path" -Method Get -TimeoutSec 30
        Write-Host " PASS" -ForegroundColor Green
        $script:pass++
        return $r
    } catch {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        $script:fail++
        return $null
    }
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  StockVision API Tests" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 1. Health
Write-Host "--- Health ---" -ForegroundColor White
Test-Endpoint "Health Check" "/health"
Write-Host ""

# 2. Stocks
Write-Host "--- Stocks ---" -ForegroundColor White
$stocks = Test-Endpoint "List Stocks" "/api/stocks/"
$code = "2330"
if ($stocks -and $stocks.Count -gt 0) {
    $code = $stocks[0].code
    Write-Host "  Found $($stocks.Count) stocks, using $code" -ForegroundColor Gray
}
Test-Endpoint "Get Stock ($code)" "/api/stocks/$code"
Test-Endpoint "Stock Industry" "/api/stocks/$code/industry"
Write-Host ""

# 3. Pre-market
Write-Host "--- Pre-market ---" -ForegroundColor White
Test-Endpoint "Pre-market Data" "/api/stocks/pre-market"
Write-Host ""

# 4. K-line
Write-Host "--- K-line ---" -ForegroundColor White
$end = (Get-Date).ToString("yyyy-MM-dd")
$start = (Get-Date).AddDays(-90).ToString("yyyy-MM-dd")
Test-Endpoint "K-line 90d" "/api/stocks/$code/kline?interval=1d&start_date=$start&end_date=$end&adjusted=true"
Write-Host ""

# 5. Chip Data
Write-Host "--- Chip Data ---" -ForegroundColor White
Test-Endpoint "Chip Data 90d" "/api/stocks/$code/chip?days=90"
Write-Host ""

# 6. Technical Analysis
Write-Host "--- Technical Analysis ---" -ForegroundColor White
Test-Endpoint "Technical (short)" "/api/analysis/technical/$code?period=short"
Test-Endpoint "Technical (medium)" "/api/analysis/technical/$code?period=medium"
Test-Endpoint "Technical (long)" "/api/analysis/technical/$code?period=long"
Write-Host ""

# 7. Chip Analysis
Write-Host "--- Chip Analysis ---" -ForegroundColor White
Test-Endpoint "Chip Analysis 90d" "/api/analysis/chip/$code?days=90"
Write-Host ""

# 8. Sentiment Analysis
Write-Host "--- Sentiment Analysis ---" -ForegroundColor White
Test-Endpoint "Sentiment 7d" "/api/analysis/sentiment/$code?days=7"
Write-Host ""

# 9. Industry Analysis
Write-Host "--- Industry Analysis ---" -ForegroundColor White
Test-Endpoint "Industry 30d" "/api/analysis/industry/$code?days=30"
Write-Host ""

# 10. Overview
Write-Host "--- Overview ---" -ForegroundColor White
Test-Endpoint "Analysis Overview" "/api/analysis/overview/$code"
Write-Host ""

# 11. Decision Tools
Write-Host "--- Decision Tools ---" -ForegroundColor White
Test-Endpoint "Score" "/api/decision/score/$code"
Test-Endpoint "Radar" "/api/decision/radar/$code"
Test-Endpoint "Signals (all)" "/api/decision/signals?level=all"
Test-Endpoint "Signals ($code)" "/api/decision/signals?stock_code=$code&level=all"
Write-Host ""

# 12. Admin
Write-Host "--- Admin ---" -ForegroundColor White
Test-Endpoint "Stock Count" "/api/admin/stock-count"
Write-Host ""

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Results: $pass passed, $fail failed" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
