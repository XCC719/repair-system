# 報修登記系統
用於提交報修並集中查閱報修紀錄。
雲端任務測試

[報修欄位表（含範例資料）](文件/報修欄位表.xlsx)

[報修系統操作說明（Word）](文件/報修系統操作說明.docx)

[報修登記系統提案（PowerPoint）](文件/報修登記系統提案.pptx)

## 網頁前端

根目錄 `index.html` 為入口，`style.css` 提供手機與桌面樣式，`app.js` 負責驗證、新增及讀取最近 20 筆報修，`config.js` 放置 Supabase URL 與公開 publishable key。supabase-js v2 由 jsDelivr CDN 載入，無建置步驟。

本機啟動：在根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000 。語法檢查：`node --check app.js` 與 `node --check config.js`。

GitHub Pages 使用 `main` 分支根目錄 `/`，預期網址：https://xcc719.github.io/repair-system/ 。Supabase 必須已建立 `supabase/schema.sql` 對應的資料表、權限與 RLS；前端只送出 reporter_name、location、category、description、urgency，狀態與登記時間由資料庫產生。清單時間以台北時間顯示。請勿放入 secret 或 service_role 金鑰。

驗證：以 Chromium / Playwright 模擬 API 檢查 390px 手機與 1280px 桌面無橫向溢出、送出欄位不含 status、成功後清空表單與更新清單、失敗保留輸入，以及登記時間顯示。手機截圖見 [預覽](docs/mobile-preview.png)。此截圖為虛構資料。雲端環境對 Supabase 網域的連線遭網路政策 403 阻擋，尚未驗證正式資料庫的新增、讀取及禁止修改／刪除規則。

## 報修清單緊急程度篩選

清單上方新增「全部、高、中、低」按鈕，預設選取「全部」，目前選項以深綠底與白字標示，並提供 `aria-pressed` 狀態。篩選僅使用網頁已讀取的最近 20 筆報修，不會因切換按鈕增加資料庫查詢，也不代表查詢所有歷史報修。重新整理或成功送出後會保留目前的篩選選項；沒有符合資料時會顯示提示。緊急程度為「高」的標籤使用紅字與淡紅底。

本次僅調整前端與說明，未修改資料庫、未新增欄位，亦未變更 `supabase/` 任何檔案。

手機確認：開啟此分支的網頁並捲到「最近報修」，確認預設「全部」被選取，依序點「高、中、低」後只顯示相符紀錄，選中按鈕有明顯底色；點回「全部」可還原清單。「高」的緊急標籤應為紅色。若某程度沒有紀錄，應顯示無符合資料提示。按鈕在手機寬度應可完整操作，且沒有橫向溢出。PR 尚未合併前，正式 GitHub Pages 仍顯示 main 版本。

## PWA 安裝與離線介面

網頁提供 `manifest.webmanifest`、192／512px 圖示與 `sw.js` Service Worker，可在支援的瀏覽器加入主畫面，以獨立視窗開啟。正式安裝需 HTTPS（GitHub Pages 已提供）；本機測試可用 `http://localhost`，不能直接雙擊 `index.html` 使用 PWA。

- Android／桌面 Chrome 或 Edge：開啟網頁，若顯示「安裝報修系統」即可點選；亦可使用瀏覽器的安裝選單。按鈕是否出現由瀏覽器決定，已安裝時不一定顯示。
- iPhone／iPad：用 Safari 開啟，從分享選單選「加入主畫面」。實際選單文字依系統版本而異。
- 第一次需連線開啟，等待頁面載入與 Service Worker 完成快取後，離線才可重新開啟介面。離線時會顯示提示，停用送出與重新整理。清單與表單不存入離線資料庫；本次頁面已載入的清單可暫時查看，關閉或重新載入後不保留。
- 不提供離線送出、自動補送或通知。尚未送出的文字只在目前頁面，勿關閉或重新載入。恢復連線後可手動送出／重新整理；若離線重開導致外部 Supabase SDK 未載入，需連線後重新載入頁面，再操作。

快取僅限此應用程式目錄的靜態介面、公開設定、manifest 與圖示；不快取 Supabase API、報修資料、外部 CDN、Word／Excel／PowerPoint 文件，也不攔截 POST。`sw.js` 更新時保留目前頁面，待舊頁面全部關閉後啟用新版；修改任何快取檔案時必須遞增 `CACHE_NAME` 的版本（目前 `v1`）。本次未變更資料庫或 `supabase/`。

驗證：先執行 `node --check app.js`、`node --check pwa.js`、`node --check sw.js`。具備 Playwright 與 Chromium 的環境可執行 `node tests/pwa.cjs`（可用 `CHROMIUM_PATH` 指定瀏覽器），測試自啟臨時 HTTP 伺服器，以 `/repair-system/` 子路徑驗證 manifest、Service Worker、離線重新載入、連線恢復、篩選、錯誤提示及無自動補送。API 使用虛構回應，未連線正式資料庫。手機離線介面截圖見 [預覽](docs/pwa-mobile-offline.png)。實際 Android／iOS 安裝仍需在裝置上確認。
