# Data directory

此目錄保存執行期資料，不把每日結果混入程式碼。

- `latest-scan.json`：最近一次掃描結果
- `scan-history.json`：最近 120 次掃描結果
- `quotes-cache.json`：最近一次成功取得且通過批次驗證的來源資料
- `history-cache.json`：個股至少120根日線的合格歷史資料

正式 provider 通過資料品質檢查後，才可寫入快取；逾時或半批次資料不應覆蓋快取。
