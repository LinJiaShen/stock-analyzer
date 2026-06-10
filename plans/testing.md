# 後端 API 測試指南

## 環境狀態

| 服務 | 狀態 | Port |
|------|------|------|
| PostgreSQL (TimescaleDB) | ✅ 運行中 | 5432 |
| Redis | ✅ 運行中 | 6379 |
| FastAPI Backend | ✅ 運行中 | 8000 |
| Next.js Frontend | ✅ 運行中 | 3000 |

## 快速測試

```powershell
# 執行完整 API 測試腳本 (19 個端點)
powershell -ExecutionPolicy Bypass -File backend/test_all_apis.ps1
```

## 手動測試

### 1. 健康檢查
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/health" -Method GET
```
預期回應: `{"status":"ok","env":"development"}`

### 2. 註冊使用者
```powershell
$body = @{username="testuser";email="test@example.com";password="test123"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/api/auth/register" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
```

### 3. 登入
```powershell
$body = @{username="testuser";password="test123"} | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
$token = $response.access_token
```

### 4. 取得使用者資訊
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8000/api/auth/me" -Method GET -Headers $headers
```

### 5. 新增持股
```powershell
$body = @{stock_code="2330";quantity=1000;avg_cost=250.5;purchase_date="2024-01-15";notes="台積電長期持有"} | ConvertTo-Json
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json; charset=utf-8" }
Invoke-RestMethod -Uri "http://localhost:8000/api/holdings" -Method POST -Body $body -Headers $headers
```

### 6. 列出持股
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8000/api/holdings" -Method GET -Headers $headers
```

---

### 7. 股票列表 (無需認證)
```powershell
# 列出所有股票 (支援搜尋/分頁)
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks?search=2330&page=1&page_size=10" -Method GET

# 取得個股基本資料
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/2330" -Method GET

# 取得產業鏈關聯
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/2330/industry" -Method GET
```

### 8. K 線數據
```powershell
# 日 K 線 (最近 30 天)
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/2330/kline?interval=1d&days=30" -Method GET

# 分 K 線 (最近 5 分鐘 K 線)
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/2330/kline?interval=5m&days=1" -Method GET
```

### 9. 籌碼數據
```powershell
# 籌碼數據 (最近 30 天)
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/2330/chip?days=30" -Method GET
```

### 10. 盤前數據
```powershell
# ADR + 國際指數
Invoke-RestMethod -Uri "http://localhost:8000/api/stocks/pre-market" -Method GET
```

---

### 11. 技術分析
```powershell
# 技術分析 (MA, RSI, MACD, KDJ, BOLL)
# period: short(60天), medium(120天), long(240天)
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/technical/2330?period=medium" -Method GET
```

### 12. 籌碼分析
```powershell
# 籌碼分析 (法人動向, 融資融券, 集中度)
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/chip/2330?days=30" -Method GET
```

### 13. 情緒分析
```powershell
# 情緒分析 (新聞情緒, 恐懼貪婪指數)
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/sentiment/2330?days=7" -Method GET
```

### 14. 產業鏈分析
```powershell
# 產業鏈分析 (同業比較, 上下游, 輪動)
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/industry/2330?days=30" -Method GET
```

### 15. 綜合分析總覽
```powershell
# 四維度加權評分 + 雷達圖數據
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/overview/2330" -Method GET
```

### 16. 批次分析
```powershell
# 最多 20 支股票同時分析
$body = @{stock_codes = @("2330","2454","3008","4904")} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/api/analysis/batch" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
```

---

### 17. 多因子評分
```powershell
# 綜合評分 (0-100)
Invoke-RestMethod -Uri "http://localhost:8000/api/decision/score/2330" -Method GET
```

### 18. 雷達圖數據
```powershell
# 五維雷達圖 (value, momentum, chip, growth, resistance)
Invoke-RestMethod -Uri "http://localhost:8000/api/decision/radar/2330" -Method GET
```

### 19. 決策樹訊號
```powershell
# 觸發訊號列表 (支援持股過濾)
Invoke-RestMethod -Uri "http://localhost:8000/api/decision/signals?holding_only=false" -Method GET
```

### 20. 每日推薦
```powershell
# 潛力股推薦 (基於評分排序)
Invoke-RestMethod -Uri "http://localhost:8000/api/decision/recommendations?top_n=10" -Method GET
```

---

### 21. 系統管理 (開發環境無需認證)
```powershell
# 同步股票列表 (TWSE/TPEx/ETF)
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/sync-stocks?category=all" -Method POST

# 批量初始化歷史 K 線數據
# 指定股票: stock_codes=2330,2454,0050
# 歷史天數: days=365 (30-3650)
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/init-historical-data?stock_codes=2330,2454&days=365" -Method POST

# 股票數量統計
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/stock-count" -Method GET
```

## API 文件

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 已修復的問題

| 問題 | 修復方式 |
|------|----------|
| Pydantic v2 `extra='forbid'` 拒絕 `DATABASE_URL`/`REDIS_URL` | 改為直接宣告為 Settings 欄位 |
| SQLAlchemy 2.0 `Decimal` 匯入錯誤 | 改為 `Numeric` |
| 缺少 `email-validator` | 加入 requirements.txt |
| passlib bcrypt 72 bytes 限制錯誤 | 改用 `bcrypt` 套件直接處理 |
| `bar_date` vs `trade_date` 欄位命名不一致 | 統一使用 `trade_date` (industry.py, scoring.py) |
| Admin 端點認證阻擋測試 | 開發環境 (`ENV=development`) 跳過認證 |
| TWSE/TPEx API 302 重定向 | 需更新 User-Agent 或改用其他資料來源 |

## 管理命令

```powershell
# 查看所有服務狀態
docker compose ps

# 查看後端日誌
docker compose logs backend --tail=50 -f

# 重新啟動後端
docker compose restart backend

# 重新啟動前端
docker compose restart frontend

# 停止所有服務
docker compose down

# 停止並清除資料卷
docker compose down -v
```

## 前端測試

```powershell
# 訪問首頁
# http://localhost:3000

# 功能卡片點擊測試
# - 技術分析 → 輸入股票代碼 → 查看分析結果
# - 籌碼分析 → 輸入股票代碼 → 查看籌碼數據
# - 情緒分析 → 輸入股票代碼 → 查看情緒評分
# - 決策中心 → 查看評分/雷達圖/訊號
```

## 測試覆蓋率

| 模組 | 端點數 | 已實作 | 測試狀態 |
|------|--------|--------|----------|
| 認證 | 5 | ✅ 完整 | ✅ 通過 |
| 股票數據 | 6 | ✅ 完整 | ✅ 通過 |
| 分析引擎 | 6 | ✅ 完整 | ⚠️ 需股票數據 |
| 決策工具 | 4 | ✅ 完整 | ⚠️ 需股票數據 |
| 持股管理 | 5 | ✅ 完整 | ✅ 通過 |
| 系統管理 | 3 | ✅ 完整 | ✅ 通過 |

## 注意事項

1. **股票數據**: 測試分析/決策端點前，需先執行 `sync-stocks` 和 `init-historical-data`
2. **TWSE API**: 官方 API 有速率限制，可能返回 302 重定向
3. **Yahoo Finance**: 歷史數據抓取有速率限制 (每支股票間隔 0.5 秒)
4. **開發環境**: Admin 端點跳過認證，生產環境需設定 `ENV=production`
