import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Server-owned policy for customer custody deliveries that exceed their balance. */
export function useNegativeCustodySetting() {
  return useQuery({
    queryKey: ["company-settings", "allow-negative-custody-delivery"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_settings")
        .select("allow_negative_custody_delivery")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.allow_negative_custody_delivery);
    },
    staleTime: 30_000,
  });
}
