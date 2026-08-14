# Railway deployment

建立單一 API Service，Start Command 使用 `npm start`。將 Railway Volume 掛載到 `/app/data`，並設定：

```text
DATA_DIR=/app/data
RAILWAY_VOLUME_MOUNT_PATH=/app/data
PERSISTENT_STORAGE=1
HISTORY_BATCH_SIZE=10
AUTO_SCAN=1
```

API 啟動後由同一 Node process 內的 coordinator 執行一次最多 10 檔的批次並持續取得下一批。它不建立 child worker，也不以 child exit callback 或 Cron 決定續跑。Railway restart 後會由 `queue.json`、`checkpoint.json` 與 `history-cache.json` 恢復。

使用 `/api/health` 檢查 `persistenceStatus`、`status`、`processed`、`remaining`、`lastProgressAt` 與 `stalled`；使用 `/api/coverage` 檢查完整覆蓋率及排除統計。未完成全體普通股前，release gate 不會發布 Top 12／Top 3。
