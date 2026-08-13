# 部署

## Railway

1. 將 Railway Volume 掛載到例如 `/app/data`。
2. 設定 `DATA_DIR=/app/data`，讓行情、歷史 K 線與掃描快取跨部署保留。
3. 設定 `HISTORY_LIMIT=20`（或依工作執行時間調整），每次掃描優先補齊快取最少的股票。
4. 執行 `npm run scan` 產生正式掃描，再由 `npm start` 提供 API 與頁面。

歷史行情只使用 TWSE 與 TPEX 官方來源。每個官方 HTTP 請求至少間隔 1.2 秒，含 15 秒逾時、最多三次重試與結構化錯誤紀錄。舊月份已有快取時不重抓，只刷新當月。

正式掃描不使用示範資料 fallback。股票必須同時具備至少 120 根有效日線、由日線按曆週聚合的 60 根週線，以及完整基本資料，才會送入推薦評分；其他股票列入 `insufficientData`。

## Docker

```bash
docker build -t tw-stock-system .
docker run -p 8787:8787 --env-file .env -v tw-stock-data:/app/data tw-stock-system
```

## 驗證

```bash
npm test
npm run check
npm run verify-release
```
