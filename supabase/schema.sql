-- 報修登記系統：供新的 Supabase 資料庫使用，僅提供檔案，不在本次工作執行。
-- 本檔採一次性建表；若資料表已存在，應先審查並另寫遷移，不覆寫既有資料。
-- 全部步驟置於交易內，日後經授權執行時，避免僅套用部分安全設定。
BEGIN;

-- 建立報修資料表：識別碼與建立時間由資料庫自動產生。
-- 以下必填與長度為本次設計選擇：姓名 100、地點 200、說明 5,000 字，業務限制仍待確認。
-- 時間以含時區型態儲存；前端依所需時區顯示。
CREATE TABLE public.repair_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    reporter_name text NOT NULL,
    location text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    urgency text NOT NULL DEFAULT '中',
    status text NOT NULL DEFAULT '待處理',

    -- CHECK 第一組：限制文字長度，並拒絕只有空白字元的輸入。
    CONSTRAINT repair_requests_reporter_name_check CHECK (
        char_length(reporter_name) BETWEEN 1 AND 100
        AND reporter_name ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_location_check CHECK (
        char_length(location) BETWEEN 1 AND 200
        AND location ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_description_check CHECK (
        char_length(description) BETWEEN 1 AND 5000
        AND description ~ '[^[:space:]]'
    ),

    -- CHECK 第二組：列舉值採需求原文；NOT NULL 另行防止以空值繞過 CHECK。
    CONSTRAINT repair_requests_category_check
        CHECK (category IN ('設備', '網路', '環境', '其他')),
    CONSTRAINT repair_requests_urgency_check
        CHECK (urgency IN ('低', '中', '高')),
    CONSTRAINT repair_requests_status_check
        CHECK (status IN ('待處理', '處理中', '已完成'))
);

-- GRANT：不依賴專案的自動授權；先清除新表可能繼承的預設資料表權限。
-- PUBLIC 代表全部角色，與 public 結構描述不同；本示範僅授權未登入的 anon。
REVOKE ALL PRIVILEGES ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.repair_requests TO anon;
-- 欄位層級 INSERT 僅開放表單輸入：不能自行指定 id、created_at 或 status。
-- urgency 可以省略以使用預設「中」；status 一律使用預設「待處理」。
GRANT INSERT (reporter_name, location, category, description, urgency)
    ON TABLE public.repair_requests TO anon;
-- 不授予 UPDATE、DELETE、TRUNCATE 或其他資料表權限。

-- RLS：即使持有資料表權限，仍必須通過資料列政策；不建立修改或刪除政策。
ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;
-- 任何未登入訪客均可讀取全部清單；authenticated 未獲本示範的存取授權。
CREATE POLICY repair_requests_anon_select
    ON public.repair_requests
    FOR SELECT TO anon
    USING (true);
-- 新增時再檢查狀態，防止日後擴大欄位權限後直接建立已完成的報修。
CREATE POLICY repair_requests_anon_insert
    ON public.repair_requests
    FOR INSERT TO anon
    WITH CHECK (status = '待處理');

-- 權限邊界：資料表擁有者及具有 BYPASSRLS 的服務角色仍可繞過 RLS。
-- 前端只使用公開金鑰；不可提供 service_role 金鑰。登入、管理員狀態更新與通知方式仍待確認。
COMMIT;
