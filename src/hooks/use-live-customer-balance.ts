import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * يجلب رصيد العميل الحي (بعد العملية) عند فتح نافذة المشاركة، لتعرض الرسالة
 * المديونية السابقة وإجمالي المستحق بدقة. طلب واحد خفيف لعمود واحد فقط.
 */
export function useLiveCustomerBalance(customerId: string | null | undefined, enabled: boolean) {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    setBalance(null);
    if (!enabled || !customerId) return;
    let cancelled = false;
    void fetchCustomerBalance(customerId).then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, enabled]);
  return balance;
}

export async function fetchCustomerBalance(customerId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", customerId)
      .maybeSingle();
    if (error || !data) return null;
    const n = Number((data as { balance: unknown }).balance);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
