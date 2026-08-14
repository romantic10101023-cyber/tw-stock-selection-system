# Taiwan Stock Selection System v3.0

## 免費官方批次歷史匯入

系統只使用 TWSE `MI_INDEX` 與 TPEX `dailyQuotes` 官方免費收盤批次資料，不使用 Data E-Shop、Yahoo、FinMind、TradingView、第三方 API 或示範資料。Railway API Service 必須掛載既有 Volume 至 `/app/data`，並設定 `DATA_DIR=/app/data`。

首次初始化在 API Service 容器內執行 `npm run bootstrap:official-bulk`。它按交易日及市場保存 raw checkpoint，再以 atomic rename 產生 `/app/data/history/<market>-<code>.json`；中斷後重跑會跳過已完成批次並合併既有有效快取。初始化期間同一把 worker lease 會暫停逐檔 worker。

每日收盤後可一次性執行 `npm run update:official-daily`。這只重新取得當日 TWSE/TPEX 全市場批次、追加去重並重算週線，不重抓 18 個月。非交易日或官方尚未公布時會保留既有快取。

進度由 `/api/health` 與 `/api/coverage` 的 `bulkImportStatus`、`bulkFilesProcessed`、覆蓋率及 `remainingSymbols` 確認。bulk 尚未完整完成時 `/api/scan` 固定回傳 `LIVE_SCAN_PENDING`，不發布 Top 3/Top 12。歷史檔只存在 Railway Volume，不提交 Git。

正式資料只使用 TWSE／TPEX 官方來源。推薦要求至少 120 根有效日線、由日線聚合的 60 根週線、完整核心基本面，以及完整普通股 universe 已完成掃描。

## Railway API Service

- Repository：本專案
- Start Command：`npm start`
- Railway Volume：必須掛載到 `/app/data`
- 環境變數：
  - `DATA_DIR=/app/data`
  - `RAILWAY_VOLUME_MOUNT_PATH=/app/data`
  - `PERSISTENT_STORAGE=1`
  - `HISTORY_BATCH_SIZE=10`
  - `AUTO_SCAN=1`

`npm start` 啟動 HTTP API，並在 `AUTO_SCAN=1` 時啟動同一 process 內的可恢復掃描協調器。API 在掃描期間持續回應首頁、`/api/health`、`/api/coverage` 與 `/api/scan`。

協調器每批最多處理 10 檔。每批完成後直接從持久化 queue 取得下一批，不依賴 child process、child exit callback 或 Railway Cron。短暫等待只用於 API/股票失敗的退避；即使等待期間 Railway restart，API 重新啟動後仍會從磁碟 checkpoint 接續，因此續跑正確性不依賴記憶體 timer。

不需要另外建立 Cron Service。若要人工執行單一批次，可使用 `npm run scan:batch`，但 production 的正常續跑由 API Service 負責。

## 持久化與復原

`DATA_DIR` 會保存：

- `queue.json`：pending、running、success、retryable、dead-letter
- `checkpoint.json`：批次、覆蓋率、最近進度與錯誤
- `results.json`：逐檔結果
- `failures.json`：失敗紀錄
- `worker-lock.json`：15 分鐘 lease
- `history-cache.json`：舊版官方 OHLCV 快取，啟動時自動讀取
- `history-by-symbol/`：新版逐檔 atomic OHLCV 快取，避免整份大檔反覆重寫
- `latest-scan.json`：API 最新結果

關鍵 JSON 全部採 temporary file 加 rename 的 atomic write，每檔完成立即保存。running 超過 15 分鐘會恢復為 retryable；單檔最多重試三次，退避 30、90、180 秒，之後進入 dead-letter。有效 120/60 快取會直接遷移為 success，不會因部署重抓。

Volume 是必要條件。僅設定 `DATA_DIR` 不代表持久化；必須同時掛載 Railway Volume 並設定 `RAILWAY_VOLUME_MOUNT_PATH=/app/data`、`PERSISTENT_STORAGE=1`。若未設定，`/api/health` 顯示 `persistenceStatus: "not_configured"`。

## 確認掃描持續

查看：

```text
GET /api/health
GET /api/coverage
GET /api/scan
```

`/api/health` 的 `scan.status` 應為 `running` 或最終的 `complete`；`lastProgressAt` 應持續更新，`processed` 與 daily/weekly coverage 應增加，`remaining` 應下降。超過 20 分鐘沒有進度時，`stalled=true` 並提供原因。

`/api/coverage` 顯示完整 queue、覆蓋率、retry/dead-letter、ETF／金融／營建排除統計與 checkpoint。只有 `remaining=0`、沒有 dead-letter、worker 完成最終確認且 release gate 通過，`/api/scan` 才會提供正式 Top 12／Top 3。

## 本機驗證

```bash
npm start
npm run scan:batch
npm test
npm run check
npm run verify-release
```
