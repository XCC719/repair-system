# 儲存庫貢獻指南

## 專案結構

本儲存庫收錄一套虛構飲料點餐系統（原為報修登記系統）。根目錄下的 `點餐需求筆記.txt` 記載點餐表單、訂單清單、欄位、存取規則及待確認事項。示範範圍如有經核准的變更，請同步更新筆記。新增任何元件時，請在本指南記錄其位置。`文件/` 內的 Excel、PowerPoint、Word 仍為報修版，尚未改寫為點餐內容。

`supabase/schema.sql` 是 `drink_orders` 的一次性建表與 GRANT、RLS、CHECK 設計檔，本次僅產生檔案，未連線或執行 SQL。

## 本機開發與檢查

目前無建置步驟；前端與 PWA 的啟動及驗證指令見下方。修改文件時，執行 `git status --short` 確認變更了哪些檔案。將變更加入暫存區後，執行 `git diff --cached --check` 檢查空白字元問題，再用 `git diff --cached` 檢視完整差異。新增可執行的元件時，請在同一批變更中記錄其設定、啟動及驗證指令。

## 文件與命名

請將 Markdown 與純文字檔案儲存為 UTF-8，以保留繁體中文標籤。提及表單欄位與狀態值時，請沿用需求筆記中的原文。範例與截圖請使用虛構姓名和地點。請明確記錄尚未定案的事項，包括是否需要登入、誰可以更新狀態，以及如何發送通知。

## 測試與審查

請確認使用者可以送出訂單，且清單會顯示該筆訂單及系統自動產生的下單時間。也請驗證示範環境的存取規則允許讀取與新增資料，並禁止修改與刪除。請在提取要求（PR）中記錄實際執行的檢查。

## 提交與提取要求

請使用簡短且明確描述動作的提交標題，例如 `新增飲料甜度選項`。在提取要求中，請說明變更內容並附上相關議題的連結。若表單或清單的畫面有變更，請附上截圖。

## 前端元件與驗證

- 根目錄 `index.html`、`style.css`、`app.js`、`config.js` 為無建置的靜態前端；`docs/mobile-preview.png` 為虛構資料的手機預覽。
- 本機執行 `python3 -m http.server 8000`，開啟 http://localhost:8000；語法檢查使用 `node --check app.js`、`node --check config.js`。
- 瀏覽器需驗證表單成功／失敗、最近清單、登記時間及手機寬度；正式資料庫連線或 RLS 無法驗證時，須在 PR 註明限制。

## PWA 元件與驗證

- `manifest.webmanifest`、`icons/` 為安裝資訊與圖示；`pwa.js` 負責安裝提示、連線狀態與 Service Worker 註冊，`sw.js` 僅快取靜態介面，不快取訂單資料或 POST。
- 修改快取檔案時遞增 `sw.js` 快取版本；新版等待舊頁面關閉後啟用，不強制重新載入表單。
- `tests/pwa.cjs` 為 Playwright 瀏覽器回歸測試，自啟本機伺服器、使用虛構 API；執行 `node tests/pwa.cjs`（需 Playwright 與 Chromium，可設 `CHROMIUM_PATH`）。語法檢查另加 `node --check pwa.js`、`node --check sw.js`。
