-- تشديد قراءة المصروفات حسب الدور.
-- سابقاً: أي موظف نشط (is_staff) يقرأ كل المصروفات، بما فيهم الكاشير وأمين المستودع.
-- الآن: المالك/المدير/المحاسب (expense_role_rank >= 30) يقرأون الكل،
-- وباقي الموظفين يقرأون فقط المستندات التي أنشأوها (لأن إدخال المسودة مسموح لهم).

-- بعض قواعد البيانات الحية سُجِّل لديها ترحيل أساس المصروفات في سجل
-- الترحيلات، لكن الدالة المساعدة لم تصل إليها. نعيد تعريفها هنا حتى يبقى
-- هذا الترحيل آمناً وقابلاً للتطبيق على قاعدة جديدة أو على تلك القواعد.
CREATE OR REPLACE FUNCTION public.expense_role_rank(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(p_user, 'owner')      THEN 50
    WHEN public.has_role(p_user, 'manager')    THEN 40
    WHEN public.has_role(p_user, 'accountant') THEN 30
    WHEN public.has_role(p_user, 'cashier')    THEN 20
    WHEN public.has_role(p_user, 'warehouse')  THEN 10
    ELSE 0
  END
$$;

REVOKE EXECUTE ON FUNCTION public.expense_role_rank(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_role_rank(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_finance(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff(p_user) AND public.expense_role_rank(p_user) >= 30
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_finance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_expense_entry(p_entry_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_read_finance(p_user)
      OR (public.is_staff(p_user) AND EXISTS (
            SELECT 1 FROM public.expense_entries e
            WHERE e.id = p_entry_id AND e.created_by = p_user))
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_expense_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_expense_entry(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "expense_entries_read" ON public.expense_entries;
CREATE POLICY "expense_entries_read" ON public.expense_entries
  FOR SELECT TO authenticated
  USING (public.can_read_finance(auth.uid())
         OR (public.is_staff(auth.uid()) AND created_by = auth.uid()));

DROP POLICY IF EXISTS "expense_lines_read" ON public.expense_lines;
CREATE POLICY "expense_lines_read" ON public.expense_lines
  FOR SELECT TO authenticated USING (public.can_read_expense_entry(entry_id, auth.uid()));

DROP POLICY IF EXISTS "expense_payments_read" ON public.expense_payments;
CREATE POLICY "expense_payments_read" ON public.expense_payments
  FOR SELECT TO authenticated USING (public.can_read_expense_entry(entry_id, auth.uid()));

DROP POLICY IF EXISTS "expense_approvals_read" ON public.expense_approvals;
CREATE POLICY "expense_approvals_read" ON public.expense_approvals
  FOR SELECT TO authenticated USING (public.can_read_expense_entry(entry_id, auth.uid()));

DROP POLICY IF EXISTS "expense_attachments_read" ON public.expense_attachments;
CREATE POLICY "expense_attachments_read" ON public.expense_attachments
  FOR SELECT TO authenticated USING (public.can_read_expense_entry(entry_id, auth.uid()));

-- جدول المصروفات القديم: كان مفتوحاً قراءةً وكتابةً لكل موظف.
DROP POLICY IF EXISTS "staff read expenses" ON public.expenses;
DROP POLICY IF EXISTS "staff write expenses" ON public.expenses;
CREATE POLICY "finance read expenses" ON public.expenses
  FOR SELECT TO authenticated USING (public.can_read_finance(auth.uid()));
CREATE POLICY "finance write expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (public.can_read_finance(auth.uid()))
  WITH CHECK (public.can_read_finance(auth.uid()));
