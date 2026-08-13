# 部署準備

## 本機／雲端容器

```bash
docker build -t tw-stock-system .
docker run -p 8787:8787 --env-file .env tw-stock-system
```

## 每日掃描

`.github/workflows/daily-scan.yml` 已設定台灣時間 23:30（UTC 15:30）平日執行。正式環境需將 `data/` 持久化，否則歷史快取與推薦紀錄會在容器重建後消失。

## 上線前限制

- 必須啟用 `USE_OFFICIAL_DATA=1`
- release gate 未通過不得視為正式推薦
- `data/latest-scan.json` 必須可被網站服務讀取
- `/api/health` 必須回傳正常與最新批次狀態
