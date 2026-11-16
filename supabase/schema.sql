-- 飲料點餐系統：供新的 Supabase 資料庫使用，僅提供檔案，不在本次工作執行。
-- 本檔採一次性建表；若資料表已存在，應先審查並另寫遷移，不覆寫既有資料。
-- 原報修系統的 repair_requests 不在本檔處理，是否保留或刪除需另行決定。
-- 全部步驟置於交易內，日後經授權執行時，避免僅套用部分安全設定。
BEGIN;

-- 建立點餐資料表：識別碼與下單時間由資料庫自動產生。
-- 以下長度與數量為本次設計選擇：姓名 100、備註 200 字、每筆 1～20 杯，業務限制仍待確認。
-- 時間以含時區型態儲存；前端依所需時區顯示。
CREATE TABLE public.drink_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    customer_name text NOT NULL,
    drink text NOT NULL,
    size text NOT NULL DEFAULT '中杯',
    sugar text NOT NULL DEFAULT '半糖',
    ice text NOT NULL DEFAULT '少冰',
    quantity integer NOT NULL DEFAULT 1,
    note text,
    status text NOT NULL DEFAULT '待製作',

    -- CHECK 第一組：限制文字長度與杯數，並拒絕只有空白字元的輸入。
    CONSTRAINT drink_orders_customer_name_check CHECK (
        char_length(customer_name) BETWEEN 1 AND 100
        AND customer_name ~ '[^[:space:]]'
    ),
    -- 備註可省略（NULL）；若有填寫則不可只有空白。
    CONSTRAINT drink_orders_note_check CHECK (
        note IS NULL
        OR (char_length(note) BETWEEN 1 AND 200 AND note ~ '[^[:space:]]')
    ),
    CONSTRAINT drink_orders_quantity_check CHECK (quantity BETWEEN 1 AND 20),

    -- CHECK 第二組：列舉值採需求原文；NOT NULL 另行防止以空值繞過 CHECK。
    CONSTRAINT drink_orders_drink_check CHECK (drink IN (
        '紅茶', '綠茶', '烏龍茶', '奶茶', '珍珠奶茶', '檸檬綠茶', '美式咖啡', '拿鐵'
    )),
    CONSTRAINT drink_orders_size_check
        CHECK (size IN ('中杯', '大杯')),
    CONSTRAINT drink_orders_sugar_check
        CHECK (sugar IN ('無糖', '微糖', '半糖', '少糖', '全糖')),
    CONSTRAINT drink_orders_ice_check
        CHECK (ice IN ('去冰', '微冰', '少冰', '正常冰', '熱')),
    CONSTRAINT drink_orders_status_check
        CHECK (status IN ('待製作', '製作中', '已完成'))
);

-- GRANT：不依賴專案的自動授權；先清除新表可能繼承的預設資料表權限。
-- PUBLIC 代表全部角色，與 public 結構描述不同；本示範僅授權未登入的 anon。
REVOKE ALL PRIVILEGES ON TABLE public.drink_orders FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.drink_orders TO anon;
-- 欄位層級 INSERT 僅開放表單輸入：不能自行指定 id、created_at 或 status。
GRANT INSERT (customer_name, drink, size, sugar, ice, quantity, note)
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
-- 前端只使用公開金鑰；不可提供 service_role 金鑰。登入、店家狀態更新、價格與付款仍待確認。
COMMIT;
