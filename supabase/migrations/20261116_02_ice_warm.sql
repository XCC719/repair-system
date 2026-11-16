-- 遷移：冰量選項新增「溫」。
-- 適用於已執行 supabase/schema.sql 的資料庫；只需執行一次。
-- 不修改既有資料：原有冰量值皆仍在新清單內。
-- 置於交易內，避免舊限制已移除而新限制未建立。
BEGIN;

ALTER TABLE public.drink_orders
    DROP CONSTRAINT drink_orders_ice_check;

ALTER TABLE public.drink_orders
    ADD CONSTRAINT drink_orders_ice_check
        CHECK (ice IN ('去冰', '微冰', '少冰', '正常冰', '溫', '熱'));

COMMIT;
