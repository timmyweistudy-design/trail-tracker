# 資料庫自動備份

`.github/workflows/backup.yml` 每週日台灣 03:00 備份一次 Supabase（`public`＋`auth`：雲端行程備份、貼文、山社、帳號），
先用你的密碼加密，才存成 GitHub Actions 附件（保留 35 天）。這個 repo 是公開的，**沒有密碼的人打不開備份檔**。

## 一次性設定（5 分鐘）
1. Supabase → 你的專案 → 上方 **Connect** → **Session pooler** → 複製連線字串
   （`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres`），把 `[YOUR-PASSWORD]` 換成資料庫密碼。
   忘了密碼：Project Settings → Database → Reset database password（App 不受影響，App 用的是 anon key）。
2. GitHub → 這個 repo → **Settings → Secrets and variables → Actions → New repository secret**：
   - `SUPABASE_DB_URL`：上面那串
   - `BACKUP_PASSPHRASE`：自己想一組長密碼（**另外記在密碼管理器**，還原要用，忘了就打不開）
3. **Actions → Database backup → Run workflow** 手動跑一次，綠色勾勾＝成功。

## 還原（希望用不到）
1. Actions → 最近一次 Database backup → 下載 `db-backup` 附件、解壓出 `.sql.gz.gpg`。
2. `gpg --decrypt trail-tracker-db-YYYYMMDD.sql.gz.gpg | gunzip > backup.sql`（輸入 BACKUP_PASSPHRASE）
3. 找 Claude 幫忙還原到 Supabase（要小心不要蓋掉現有資料）。
