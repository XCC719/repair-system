-- 遷移：飲品由固定清單改為手動輸入。
-- 適用於已執行 supabase/schema.sql 的資料庫；只需執行一次。
-- 不修改既有資料：原清單內的飲品皆符合新規則（1～50 字、不可只有空白）。
-- 置於交易內，避免舊限制已移除而新限制未建立。
BEGIN;

ALTER TABLE public.drink_orders
    DROP CONSTRAINT drink_orders_drink_check;

ALTER TABLE public.drink_orders
    ADD CONSTRAINT drink_orders_drink_check CHECK (
        char_length(drink) BETWEEN 1 AND 50
        AND drink ~ '[^[:space:]]'
    );

COMMIT;
