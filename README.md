# 報修登記系統
用於提交報修並集中查閱報修紀錄。
雲端任務測試

[報修欄位表（含範例資料）](文件/報修欄位表.xlsx)

## 網頁前端

根目錄 `index.html` 為入口，`style.css` 提供手機與桌面樣式，`app.js` 負責驗證、新增及讀取最近 20 筆報修，`config.js` 放置 Supabase URL 與公開 publishable key。supabase-js v2 由 jsDelivr CDN 載入，無建置步驟。

本機啟動：在根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000 。語法檢查：`node --check app.js` 與 `node --check config.js`。

GitHub Pages 使用 `main` 分支根目錄 `/`，預期網址：https://xcc719.github.io/repair-system/ 。Supabase 必須已建立 `supabase/schema.sql` 對應的資料表、權限與 RLS；前端只送出 reporter_name、location、category、description、urgency，狀態與登記時間由資料庫產生。清單時間以台北時間顯示。請勿放入 secret 或 service_role 金鑰。

驗證：以 Chromium / Playwright 模擬 API 檢查 390px 手機與 1280px 桌面無橫向溢出、送出欄位不含 status、成功後清空表單與更新清單、失敗保留輸入，以及登記時間顯示。手機截圖見 [預覽](docs/mobile-preview.png)。此截圖為虛構資料。雲端環境對 Supabase 網域的連線遭網路政策 403 阻擋，尚未驗證正式資料庫的新增、讀取及禁止修改／刪除規則。
