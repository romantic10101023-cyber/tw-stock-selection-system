# Taiwan Stock Selection System v3.0

正式資料只使用 TWSE／TPEX 官方來源。正式推薦要求至少 120 根有效日線、由日線聚合的 60 根週線、完整核心基本面，以及完整普通股 universe 已完成歷史掃描。

## 本機指令

```bash
npm start
npm run scan:batch
npm test
npm run check
npm run verify-release
```

`npm start` 只啟動 HTTP API，不會自動開始或無限續跑掃描。`npm run scan:batch` 最多處理 `HISTORY_BATCH_SIZE` 檔（預設 10、上限 20），保存後正常結束。

## Railway production：採用受保護 API 觸發（方案 A）

Railway 不允許假設不同 service 可以共享同一個 Volume，因此 checkpoint 只由 API Service 寫入其 Volume；Cron Service 透過受保護 endpoint 要求 API Service 執行一批。

### 1. API Service

- Repository：本專案 GitHub repository
- Start Command：`npm start`
- 環境變數：
  - `DATA_DIR=/app/data`
  - `RAILWAY_VOLUME_MOUNT_PATH=/app/data`
  - `PERSISTENT_STORAGE=1`
  - `BATCH_TRIGGER_TOKEN=<長且隨機的密鑰>`
  - `HISTORY_BATCH_SIZE=10`
- Railway Volume：必須建立並掛載到 `/app/data`
- 對外提供首頁、`/api/health`、`/api/scan`、`/api/coverage`，以及受 Bearer token 保護的 `POST /api/admin/scan-batch`。

若未掛載 Volume，`/api/health` 會回傳 `persistenceStatus: "not_configured"`。這表示容器重啟會遺失 queue，不能宣稱可長期續跑。

### 2. Batch/Cron Service

- Repository：同一個 GitHub repository
- 不需 Volume，也不得執行 `npm start`
- Start Command：`npm run scan:trigger`
- Cron Schedule：`*/5 * * * *`
- 環境變數：
  - `BATCH_TRIGGER_URL=https://<API-Service-domain>/api/admin/scan-batch`
  - `BATCH_TRIGGER_TOKEN=<與 API Service 完全相同的密鑰>`

Cron Service 每次只送出一次受保護請求後退出。實際 worker 是 API Service 的短生命 child process，因此讀寫同一個 `/app/data` Volume。即使 Cron 重疊，`worker-lock.json` lease 與 API process guard 也只允許一批執行；重疊請求會得到 `alreadyRunning`。

## 持久化檔案

`DATA_DIR` 包含：

- `queue.json`：每檔的 pending/running/success/retryable/dead-letter 狀態
- `checkpoint.json`：批次進度、覆蓋率與最近錯誤
- `results.json`：逐檔結果
- `failures.json`：逐次錯誤紀錄
- `worker-lock.json`：15 分鐘 lease
- `history-cache.json`：有效官方 OHLCV 快取
- `latest-scan.json`：API 最新結果

所有關鍵狀態使用 temporary file 加 rename 的 atomic write。啟動時會把超過 15 分鐘的 running 工作恢復成 retryable；最多重試三次，退避為 30、90、180 秒，之後進入 dead-letter。單檔失敗不會終止同批其他股票。

舊版已有的 `history-cache.json` 會自動遷移：達到 120 日線與 60 週線者直接標記 success。因此原本 209/1803 若 Volume 仍保留舊快取，新 worker 會從下一個未完成股票繼續；若舊容器沒有 Volume，已遺失的本機檔案無法由程式復原。
