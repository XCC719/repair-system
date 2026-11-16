-- 遷移：訂單編號改為「台北日期 YYMMDD-4 碼流水號」，例如 261116-0001，每日從 0001 起算。
-- 適用於已執行 20261116_03_order_no.sql 的資料庫；只需執行一次。
-- 做法：新增每日計數表與 place_order 函式，由資料庫在同一交易內取號並新增整張訂單；
-- 任一杯不符規則時整筆取消，不會用掉編號。anon 改為只能透過 place_order 新增，不能直接寫入資料表。
-- 既有資料不修改；原 order_no 格式限制已包含數字流水號，維持不變。
BEGIN;

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

-- anon 不再直接新增資料列（含欄位層級權限），只能透過 place_order；讀取權限不變。
REVOKE INSERT ON TABLE public.drink_orders FROM anon;
REVOKE INSERT (customer_name, drink, sugar, ice, amount, quantity, note, order_no)
    ON TABLE public.drink_orders FROM anon;

COMMIT;

-- 讓 Supabase API 立即載入新函式。
NOTIFY pgrst, 'reload schema';
