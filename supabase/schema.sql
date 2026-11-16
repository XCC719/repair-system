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
    -- 訂單編號：同一張訂單的每杯共用，由 place_order 產生，例如 261116-0001；舊資料可為 NULL。
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
-- anon 不直接新增資料列；新增訂單一律透過下方 place_order 函式，由資料庫產生訂單編號。
-- 不授予 INSERT、UPDATE、DELETE、TRUNCATE 或其他資料表權限。

-- RLS：即使持有資料表權限，仍必須通過資料列政策；不建立修改或刪除政策。
ALTER TABLE public.drink_orders ENABLE ROW LEVEL SECURITY;
-- 任何未登入訪客均可讀取全部訂單；authenticated 未獲本示範的存取授權。
CREATE POLICY drink_orders_anon_select
    ON public.drink_orders
    FOR SELECT TO anon
    USING (true);
-- 新增時再檢查狀態，防止日後開放直接新增時建立已完成的訂單（目前 anon 無 INSERT 權限）。
CREATE POLICY drink_orders_anon_insert
    ON public.drink_orders
    FOR INSERT TO anon
    WITH CHECK (status = '待製作');

-- 每日計數：day 為台北日期，last_no 為當日最後使用的流水號。
CREATE TABLE public.drink_order_counters (
    day date PRIMARY KEY,
    last_no integer NOT NULL CHECK (last_no BETWEEN 1 AND 9999)
);
-- 計數表不開放任何前端角色；只由 place_order（以擁有者權限執行）存取。
REVOKE ALL PRIVILEGES ON TABLE public.drink_order_counters FROM PUBLIC, anon, authenticated;
ALTER TABLE public.drink_order_counters ENABLE ROW LEVEL SECURITY;

-- place_order：取得當日下一個編號並新增整張訂單，回傳訂單編號。
-- p_items 為 JSON 陣列，每杯含 drink、sugar、ice、amount、quantity、note（可為 null），1～20 杯。
-- 各欄位仍由 drink_orders 的 CHECK 限制檢查；status、id、created_at 一律使用預設值。
CREATE FUNCTION public.place_order(p_customer_name text, p_items jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_day date := (now() AT TIME ZONE 'Asia/Taipei')::date;
    v_prefix text := to_char((now() AT TIME ZONE 'Asia/Taipei')::date, 'YYMMDD');
    v_no integer;
    v_order_no text;
BEGIN
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION '訂單須包含 1 到 20 項飲品' USING ERRCODE = '22023';
    END IF;

    -- 當日第一次取號時，從既有同日數字編號的最大值接續，避免與舊資料重複。
    INSERT INTO public.drink_order_counters AS c (day, last_no)
    VALUES (v_day, COALESCE((
        SELECT max(substr(order_no, 8)::integer)
        FROM public.drink_orders
        WHERE order_no ~ ('^' || v_prefix || '-[0-9]{4}$')
    ), 0) + 1)
    ON CONFLICT (day) DO UPDATE SET last_no = c.last_no + 1
    RETURNING last_no INTO v_no;
    -- 超過 9999 時，計數表的 CHECK 會拒絕並取消整筆訂單。

    v_order_no := v_prefix || '-' || lpad(v_no::text, 4, '0');

    INSERT INTO public.drink_orders (order_no, customer_name, drink, sugar, ice, amount, quantity, note)
    SELECT v_order_no, p_customer_name, i.drink, i.sugar, i.ice, i.amount, i.quantity, i.note
    FROM jsonb_to_recordset(p_items)
        AS i(drink text, sugar text, ice text, amount integer, quantity integer, note text);

    RETURN v_order_no;
END;
$$;

-- 函式只開放 anon 執行；先移除預設的 PUBLIC 執行權限。
REVOKE ALL ON FUNCTION public.place_order(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text, jsonb) TO anon;

-- 權限邊界：資料表擁有者及具有 BYPASSRLS 的服務角色仍可繞過 RLS。
-- 前端只使用公開金鑰；不可提供 service_role 金鑰。登入、店家狀態更新與付款方式仍待確認。
COMMIT;

-- 讓 Supabase API 立即載入新函式。
NOTIFY pgrst, 'reload schema';
