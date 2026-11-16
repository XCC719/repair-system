-- 遷移：新增訂單編號 order_no，讓同一張訂單的多杯飲品可以分組。
-- 適用於已執行 supabase/schema.sql 的資料庫；只需執行一次。
-- 既有資料的 order_no 為 NULL（無訂單編號），清單中各自顯示為一張訂單。
-- 格式：台北日期 YYMMDD、連字號、4 碼大寫英數（不含容易混淆的 I、O），例如 261116-7K3P。
-- 編號由前端在確認訂單時產生，同一張訂單的每杯共用；資料庫只檢查格式。
-- 置於交易內，避免欄位已新增而權限或限制未建立。
BEGIN;

ALTER TABLE public.drink_orders
    ADD COLUMN order_no text;

ALTER TABLE public.drink_orders
    ADD CONSTRAINT drink_orders_order_no_check CHECK (
        order_no IS NULL
        OR order_no ~ '^[0-9]{6}-[0-9A-HJ-NP-Z]{4}$'
    );

-- 依訂單編號查詢同一張訂單時使用。
CREATE INDEX drink_orders_order_no_idx ON public.drink_orders (order_no);

-- 欄位層級 INSERT：允許 anon 寫入訂單編號；其餘權限不變。
GRANT INSERT (order_no) ON TABLE public.drink_orders TO anon;

COMMIT;
