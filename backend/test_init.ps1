# 測試股票數據初始化流程
$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:8000"

Write-Host "=== 1. 註冊使用者 ===" -ForegroundColor Cyan
try {
    $regBody = @{
        username = "admin"
        email = "admin@test.com"
        password = "admin123"
    } | ConvertTo-Json

    $reg = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method POST -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($regBody)) -UseBasicParsing
    Write-Host "註冊成功" -ForegroundColor Green
} catch {
    Write-Host "註冊: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== 2. 登入取得 Token ===" -ForegroundColor Cyan
try {
    $loginBody = @{
        username = "admin"
        password = "admin123"
    } | ConvertTo-Json

    $login = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($loginBody)) -UseBasicParsing
    $token = ($login.Content | ConvertFrom-Json).access_token
    Write-Host "Token: $token.Substring(0, [Math]::Min(30, $token.Length))..." -ForegroundColor Green
} catch {
    Write-Host "登入: $($_.Exception.Message)" -ForegroundColor Yellow
    $token = ""
}

Write-Host "`n=== 3. 股票數量統計 ===" -ForegroundColor Cyan
try {
    $stats = Invoke-WebRequest -Uri "$baseUrl/api/admin/stock-count" -UseBasicParsing
    Write-Host $stats.Content -ForegroundColor Green
} catch {
    Write-Host "統計: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== 4. 同步股票列表 (twse) ===" -ForegroundColor Cyan
if ($token) {
    try {
        $headers = @{ "Authorization" = "Bearer $token" }
        $sync = Invoke-WebRequest -Uri "$baseUrl/api/admin/sync-stocks?category=twse" -Method POST -Headers $headers -UseBasicParsing -TimeoutSec 120
        Write-Host $sync.Content -ForegroundColor Green
    } catch {
        Write-Host "同步: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "需要 token 才能同步" -ForegroundColor Yellow
}

Write-Host "`n=== 5. 股票數量統計 (同步後) ===" -ForegroundColor Cyan
try {
    $stats = Invoke-WebRequest -Uri "$baseUrl/api/admin/stock-count" -UseBasicParsing
    Write-Host $stats.Content -ForegroundColor Green
} catch {
    Write-Host "統計: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== 6. 初始化歷史數據 (2330, 2454, 0050) ===" -ForegroundColor Cyan
if ($token) {
    try {
        $headers = @{ "Authorization" = "Bearer $token" }
        $init = Invoke-WebRequest -Uri "$baseUrl/api/admin/init-historical-data?stock_codes=2330%2C2454%2C0050&days=365" -Method POST -Headers $headers -UseBasicParsing -TimeoutSec 300
        Write-Host $init.Content -ForegroundColor Green
    } catch {
        Write-Host "初始化: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "需要 token 才能初始化" -ForegroundColor Yellow
}

Write-Host "`n=== 7. 測試 K 線 API (2330) ===" -ForegroundColor Cyan
try {
    $kline = Invoke-WebRequest -Uri "http://localhost:8000/api/stocks/2330/kline?interval=1d&start_date=2025-01-01&end_date=2025-01-31" -UseBasicParsing
    $data = $kline.Content | ConvertFrom-Json
    Write-Host "股票: $($data.stock_code), 筆數: $($data.data.Count)" -ForegroundColor Green
    if ($data.data.Count -gt 0) {
        Write-Host "第一筆: $($data.data[0] | ConvertTo-Json -Compress)" -ForegroundColor Green
    }
} catch {
    Write-Host "K線: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== 測試完成 ===" -ForegroundColor Cyan
