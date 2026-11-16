# 飲料點餐系統
用於點選飲料並集中查閱最近訂單（虛構示範，原為報修登記系統）。

需求與待確認事項見 [點餐需求筆記](點餐需求筆記.txt)。`文件/` 內的 Excel、PowerPoint、Word 仍為報修版，尚未改寫。

## 網頁前端

根目錄 `index.html` 為入口，`style.css` 提供手機與桌面樣式，`app.js` 負責驗證、新增及讀取最近 20 筆訂單，`config.js` 放置 Supabase URL 與公開 publishable key。supabase-js v2 由 jsDelivr CDN 載入，無建置步驟。

- 表單欄位：點餐人、飲品、糖份（無糖～全糖）、冰量（去冰～正常冰、熱）、金額、數量、備註（選填）。
- 金額為每杯價格，依店家實際價目手動輸入（1～9,999 元整數）；數量 1～50 杯。表單即時顯示「小計＝金額 × 數量」。系統不內建價目表，無法確認輸入的金額是否正確。
- 清單：最近 20 筆，新的在上面，時間以台北時間顯示；可依製作狀態「全部、待製作、製作中、已完成」篩選（僅篩選已載入的 20 筆），並顯示目前篩選的筆數、杯數與合計金額。
- 前端只送出 customer_name、drink、sugar、ice、amount、quantity 及有填寫的 note；狀態與下單時間由資料庫產生。

本機啟動：在根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000 。語法檢查：`node --check app.js` 與 `node --check config.js`。

## 資料庫

Supabase 須先執行 `supabase/schema.sql` 建立 `drink_orders` 資料表、權限與 RLS（任何人可新增、讀取，不可修改、刪除）。已於 2026-11-16 在正式專案執行；舊的 `repair_requests` 表不受影響。本檔為一次性建表，不可對已存在的資料表重複執行。請勿在前端放入 secret 或 service_role 金鑰。

## PWA 安裝與離線介面

網頁提供 `manifest.webmanifest`、192／512px 圖示與 `sw.js` Service Worker，可在支援的瀏覽器加入主畫面。正式安裝需 HTTPS（GitHub Pages 已提供）；本機測試可用 `http://localhost`。

- 第一次需連線開啟，Service Worker 快取後才可離線重新開啟介面。離線時停用送出與重新整理，不儲存訂單或表單，也不自動補送。
- 快取僅限此目錄的靜態介面、公開設定、manifest 與圖示；不快取 Supabase API、訂單資料或外部 CDN，也不攔截 POST。修改快取檔案時須遞增 `sw.js` 的 `CACHE_NAME` 版本（目前 `drink-shell` `v1`）；啟用時會清除同範圍舊報修版快取。

## 驗證

執行 `node --check app.js`、`node --check pwa.js`、`node --check sw.js`，以及 `node tests/pwa.cjs`（需 Playwright 與 Chromium，可用 `CHROMIUM_PATH` 指定）。測試以虛構 API 驗證 manifest、Service Worker、離線重新載入、狀態篩選與合計金額、金額與數量驗證、送出欄位、錯誤提示及無自動補送。手機截圖見 [預覽](docs/mobile-preview.png) 與 [離線畫面](docs/pwa-mobile-offline.png)，皆為虛構資料。實際 Android／iOS 安裝仍需在裝置上確認。

### 正式資料庫驗證（2026-11-16）

以前端相同的 publishable key 直接呼叫 Supabase REST API 測試 `drink_orders`：

| # | 測試 | 預期 | 結果 |
|---|---|---|---|
| 1 | 讀取訂單 | 允許 | 通過（200） |
| 2 | 新增訂單（含備註） | 允許 | 通過（201） |
| 3 | 新增訂單（省略備註） | 允許 | 通過（201） |
| 4 | 金額 0 | 拒絕 | 通過（`drink_orders_amount_check`） |
| 5 | 數量 51 | 拒絕 | 通過（`drink_orders_quantity_check`） |
| 6 | 不在清單的飲品 | 拒絕 | 通過（`drink_orders_drink_check`） |
| 7 | 備註只有空白 | 拒絕 | 通過（`drink_orders_note_check`） |
| 8 | 自行指定狀態「已完成」 | 拒絕 | 通過（無權限） |
| 9 | 修改狀態 | 拒絕 | 通過（無權限） |
| 10 | 刪除訂單 | 拒絕 | 通過（無權限） |

- 新增的資料讀回正確，狀態自動為「待製作」、下單時間由資料庫產生；修改與刪除後再讀回，資料未變。
- 以實際網頁連線正式資料庫，清單正確顯示訂單、小計、合計與台北時間（測試環境封鎖 jsDelivr，改以 npm 取得的同一 supabase-js 套件代替 CDN）。
- 從網頁送出訂單僅以模擬 API 驗證，連線正式資料庫時只讀取，未從網頁送出。
- 測試寫入兩筆點餐人為「自動測試（虛構）061911」的訂單；前端無法刪除，需由管理者在 Supabase 手動清除。
