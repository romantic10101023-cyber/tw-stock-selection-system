# 部署

## Railway

1. 將 Railway Volume 掛載到例如 `/app/data`。
2. 設定 `DATA_DIR=/app/data`，讓行情、歷史 K 線與掃描快取跨部署保留。
3. 設定 `HISTORY_BATCH_SIZE=10`。正式掃描會用持久化佇列分批涵蓋完整候選池，保留已驗證快取，並在每檔完成後寫入 checkpoint；不得用 `HISTORY_LIMIT` 截斷股票池。
4. 設定 `AUTO_SCAN=1`（預設值）。`npm start` 啟動 HTTP server 後會在背景執行正式掃描，不會阻塞 Railway health check。
5. 掃描期間 `/api/scan` 回傳 HTTP 202 與 JSON 原因；完成後回傳正式推薦契約。`/api/coverage` 提供逐檔覆蓋資訊，`/api/health` 提供背景掃描程序狀態。

歷史行情只使用 TWSE 與 TPEX 官方來源。每個官方 HTTP 請求至少間隔 1.2 秒，含 15 秒逾時、最多三次重試與結構化錯誤紀錄。舊月份已有快取時不重抓，只刷新當月。

正式掃描不使用示範資料 fallback。股票必須同時具備至少 120 根有效日線、由日線按曆週聚合的 60 根週線，以及完整基本資料，才會送入推薦評分；其他股票列入 `insufficientData`。

如需將 web server 與排程掃描拆成不同 Railway service，可在 web service 設定 `AUTO_SCAN=0`，並由另一個 service 執行 `npm run scan`；兩者必須掛載同一個 `DATA_DIR` Volume。

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
