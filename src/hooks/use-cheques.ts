import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChequeRecord, ChequeStatus } from "@/lib/payments/treasury-types";
import { bounceChequeFn, clearChequeFn } from "@/functions/treasury/cheques";

export const CHEQUES_QUERY_KEY = ["treasury", "cheques"] as const;

const db = supabase as any;

export function useCheques(statusFilter?: ChequeStatus) {
  const query = useQuery({
    queryKey: [...CHEQUES_QUERY_KEY, statusFilter ?? "ALL"],
    queryFn: async (): Promise<ChequeRecord[]> => {
      try {
        let q = db
          .from("cheques_register")
          .select("*, customer:customers(id, name, phone)")
          .order("due_date", { ascending: true });

        if (statusFilter) {
          q = q.eq("status", statusFilter);
        }

        const { data, error } = await q;

        if (error) {
          console.warn("Could not fetch cheques register from db:", error.message);
          return [];
        }

        return (data ?? []) as ChequeRecord[];
      } catch (err) {
        console.warn("Cheques register table not yet ready:", err);
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  return {
    cheques: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useClearCheque() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chequeId,
      clearingBankAccountId,
      clearedDate,
      notes,
    }: {
      chequeId: string;
      clearingBankAccountId: string;
      clearedDate?: string;
      notes?: string;
    }) => {
      // المرحلة 13.2: نفس الذرّية عبر server function بدل RPC (clear_cheque سابقًا).
      return clearChequeFn({
        data: {
          chequeId,
          clearingBankAccountId,
          clearedDate: clearedDate || new Date().toISOString().slice(0, 10),
          notes: notes || null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHEQUES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["accounting", "entries"] });
      queryClient.invalidateQueries({ queryKey: ["treasury", "company_bank_accounts"] });
    },
  });
}

export function useBounceCheque() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chequeId,
      reason,
      penaltyAmount = 0,
    }: {
      chequeId: string;
      reason?: string;
      penaltyAmount?: number;
    }) => {
      // المرحلة 13.2: نفس الذرّية عبر server function بدل RPC (bounce_cheque سابقًا).
      // p_penalty_amount لم تكن مدعومة في الدالة الأصلية أصلًا (تجاهلها الواجهة).
      return bounceChequeFn({
        data: {
          chequeId,
          reason: reason || "عدم كفاية الرصيد",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHEQUES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["accounting", "entries"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
