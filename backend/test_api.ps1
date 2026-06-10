# 測試 API 端點
$body = @{
    username = "testuser"
    email = "test@example.com"
    password = "test123"
} | ConvertTo-Json

Write-Host "=== 測試註冊 ==="
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
    Write-Host "註冊成功:" ($response | ConvertTo-Json -Compress)
} catch {
    Write-Host "註冊失敗: $_"
}

Write-Host ""
Write-Host "=== 測試登入 ==="
$loginBody = @{
    username = "testuser"
    password = "test123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json; charset=utf-8"
    Write-Host "登入成功:" ($response | ConvertTo-Json -Compress)
    $token = $response.access_token
} catch {
    Write-Host "登入失敗: $_"
    $token = ""
}

if ($token) {
    Write-Host ""
    Write-Host "=== 測試取得使用者資訊 ==="
    try {
        $headers = @{ Authorization = "Bearer $token" }
        $response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/me" -Method GET -Headers $headers
        Write-Host "使用者資訊:" ($response | ConvertTo-Json -Compress)
    } catch {
        Write-Host "取得使用者資訊失敗: $_"
    }
}

Write-Host ""
Write-Host "=== 測試 API 文件 ==="
Write-Host "Swagger UI: http://localhost:8000/docs"
Write-Host "ReDoc: http://localhost:8000/redoc"
