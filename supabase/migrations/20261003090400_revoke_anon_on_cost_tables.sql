-- إغلاق وصول anon على جداول التكلفة صراحةً.
-- RLS كانت تحجب القراءة فعلياً (صفر صفوف لـ anon)، لكن منح الجدول لـ anon
-- بلا فائدة وي，靠 على RLS وحدها لتكون خطرة. المنح الصريح يجعلها مغلقة
-- على مستوى ACL أيضاً.
REVOKE ALL ON TABLE public.item_cost_layers       FROM anon;
REVOKE ALL ON TABLE public.item_cost_transactions FROM anon;