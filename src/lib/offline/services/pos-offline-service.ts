/**
 * Market-Hub ERP - Offline POS & Sales Service Engine
 * Executes atomic local sales transactions, printable local receipt refs, stock updates, and Outbox queueing.
 */

import { generateUUIDv7, generateLocalDocRef, getOrCreateDeviceId } from "../idempotency";
import { globalSyncEngine } from "../sync-engine";
import { inventoryRepo } from "../repositories/inventory-repository";
import { getOfflineStorageAdapter } from "../storage-adapter";

export interface POSCartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface CreateOfflinePOSSalePayload {
  customer_id?: string | null;
  warehouse_id: string;
  items: POSCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  // Keep local/offline payloads aligned with the existing online POS methods.
  // These values are already passed through to the queued RPC payload.
  payment_method: "cash" | "card" | "credit" | "split" | "mobile_money" | "bank_transfer";
  notes?: string;
}

export interface OfflinePOSSaleResult {
  invoice_id: string;
  local_document_ref: string;
  status: "pending_sync";
  created_at: string;
  total: number;
}

export class POSOfflineService {
  private adapter = getOfflineStorageAdapter();
  private deviceId = getOrCreateDeviceId();
  private localSequence = 1;

  /**
   * Processes a complete POS Sale offline atomically.
   */
  async processOfflineSale(payload: CreateOfflinePOSSalePayload): Promise<OfflinePOSSaleResult> {
    const invoiceId = generateUUIDv7();
    const localRef = generateLocalDocRef("POS", this.deviceId, this.localSequence++);
    const timestamp = new Date().toISOString();

    const invoiceRecord = {
      id: invoiceId,
      local_document_ref: localRef,
      server_document_number: null,
      customer_id: payload.customer_id || null,
      warehouse_id: payload.warehouse_id,
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      total: payload.total,
      paid: payload.paid,
      payment_method: payload.payment_method,
      status: "pending_sync",
      created_at: timestamp,
      items: payload.items,
      notes: payload.notes || null,
    };

    // 1. Save local document record
    await this.adapter.setItem("sales_invoices", invoiceId, invoiceRecord);

    // 2. Update local inventory positions
    for (const item of payload.items) {
      await inventoryRepo.updateStockLocal(item.product_id, payload.warehouse_id, -item.quantity);
    }

    // 3. Enqueue to Outbox with HIGH priority
    await globalSyncEngine.enqueue({
      entity_name: "create_sale_transaction", // Calls atomic Supabase RPC when online
      operation_type: "RPC",
      payload: invoiceRecord,
      priority: "high",
      local_document_ref: localRef,
    });

    return {
      invoice_id: invoiceId,
      local_document_ref: localRef,
      status: "pending_sync",
      created_at: timestamp,
      total: payload.total,
    };
  }
}

export const posOfflineService = new POSOfflineService();
