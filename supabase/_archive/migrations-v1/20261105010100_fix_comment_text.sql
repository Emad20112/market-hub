-- تصحيح COMMENT عبر migration جديدة (لا يُعدَّل migration مطبَّقة)
COMMENT ON FUNCTION public.set_standard_costs(jsonb) IS
  'اعتماد معايير تكلفة واحدة دفعة واحدة، وكل قيمة تُدوَّن في سجل التدقيق مع قيمتها القائمة للمقارنة.';