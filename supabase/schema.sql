-- 飲料點餐系統：供新的 Supabase 資料庫使用，僅提供檔案，不在本次工作執行。
-- 本檔採一次性建表；若資料表已存在，應先審查並另寫遷移，不覆寫既有資料。
-- 已建立的資料庫請改執行 supabase/migrations/ 內尚未執行的遷移檔，不要重複執行本檔。
-- 原報修系統的 repair_requests 不在本檔處理，是否保留或刪除需另行決定。
-- 全部步驟置於交易內，日後經授權執行時，避免僅套用部分安全設定。
BEGIN;

-- 建立點餐資料表：識別碼與下單時間由資料庫自動產生。
-- 表單欄位：點餐人 customer_name、飲品 drink、糖份 sugar、冰量 ice、
-- 金額 amount（每杯價格，新台幣整數，依實際價目手動輸入）、數量 quantity、備註 note（選填）。
-- 小計 = amount × quantity，由前端顯示，不另存欄位。
-- 時間以含時區型態儲存；前端依所需時區顯示。
CREATE TABLE public.drink_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    customer_name text NOT NULL,
    drink text NOT NULL,
    sugar text NOT NULL DEFAULT '半糖',
    ice text NOT NULL DEFAULT '少冰',
    amount integer NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    note text,
    status text NOT NULL DEFAULT '待製作',
    -- 訂單編號：同一張訂單的每杯共用，例如 261116-7K3P；舊資料可為 NULL。
    order_no text,

    -- CHECK 第一組：文字長度與數值範圍（設計選擇，待確認），並拒絕只有空白字元的輸入。
    CONSTRAINT drink_orders_customer_name_check CHECK (
        char_length(customer_name) BETWEEN 1 AND 100
        AND customer_name ~ '[^[:space:]]'
    ),
    -- 備註可省略（NULL）；若有填寫則最多 200 字且不可只有空白。
    CONSTRAINT drink_orders_note_check CHECK (
        note IS NULL
        OR (char_length(note) BETWEEN 1 AND 200 AND note ~ '[^[:space:]]')
    ),
    -- 金額為手動輸入，資料庫只檢查合理範圍，無法確認是否符合店家價目。
    CONSTRAINT drink_orders_amount_check CHECK (amount BETWEEN 1 AND 9999),
    CONSTRAINT drink_orders_quantity_check CHECK (quantity BETWEEN 1 AND 50),

    -- CHECK 第二組：列舉值採需求原文；NOT NULL 另行防止以空值繞過 CHECK。
    -- 飲品為手動輸入：最多 50 字且不可只有空白（2026-11-16 起，取代原飲品清單）。
    CONSTRAINT drink_orders_drink_check CHECK (
        char_length(drink) BETWEEN 1 AND 50
        AND drink ~ '[^[:space:]]'
    ),
    CONSTRAINT drink_orders_sugar_check
        CHECK (sugar IN ('無糖', '微糖', '半糖', '少糖', '全糖')),
    CONSTRAINT drink_orders_ice_check
        CHECK (ice IN ('去冰', '微冰', '少冰', '正常冰', '溫', '熱')),
    CONSTRAINT drink_orders_order_no_check CHECK (
        order_no IS NULL
        OR order_no ~ '^[0-9]{6}-[0-9A-HJ-NP-Z]{4}$'
    ),
    CONSTRAINT drink_orders_status_check
        CHECK (status IN ('待製作', '製作中', '已完成'))
);

-- 依訂單編號查詢同一張訂單時使用。
CREATE INDEX drink_orders_order_no_idx ON public.drink_orders (order_no);

-- GRANT：不依賴專案的自動授權；先清除新表可能繼承的預設資料表權限。
-- PUBLIC 代表全部角色，與 public 結構描述不同；本示範僅授權未登入的 anon。
REVOKE ALL PRIVILEGES ON TABLE public.drink_orders FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.drink_orders TO anon;
-- 欄位層級 INSERT 僅開放表單輸入：不能自行指定 id、created_at 或 status。
GRANT INSERT (customer_name, drink, sugar, ice, amount, quantity, note, order_no)
    ON TABLE public.drink_orders TO anon;
-- 不授予 UPDATE、DELETE、TRUNCATE 或其他資料表權限。

-- RLS：即使持有資料表權限，仍必須通過資料列政策；不建立修改或刪除政策。
ALTER TABLE public.drink_orders ENABLE ROW LEVEL SECURITY;
-- 任何未登入訪客均可讀取全部訂單；authenticated 未獲本示範的存取授權。
CREATE POLICY drink_orders_anon_select
    ON public.drink_orders
    FOR SELECT TO anon
    USING (true);
-- 新增時再檢查狀態，防止日後擴大欄位權限後直接建立已完成的訂單。
CREATE POLICY drink_orders_anon_insert
    ON public.drink_orders
    FOR INSERT TO anon
    WITH CHECK (status = '待製作');

-- 權限邊界：資料表擁有者及具有 BYPASSRLS 的服務角色仍可繞過 RLS。
-- 前端只使用公開金鑰；不可提供 service_role 金鑰。登入、店家狀態更新與付款方式仍待確認。
COMMIT;
