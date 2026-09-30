/**
 * Market-Hub ERP - Offline Financial Operations & Payment Engine
 */

import { generateUUIDv7, generateLocalDocRef, getOrCreateDeviceId } from '../idempotency';
import { globalSyncEngine } from '../sync-engine';
import { customersRepo, suppliersRepo } from '../repositories/contacts-repository';
import { getOfflineStorageAdapter } from '../storage-adapter';

export interface CreateOfflineCustomerPaymentPayload {
  customer_id: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'bank_transfer';
  notes?: string;
}

export interface CreateOfflineExpensePayload {
  category_id: string;
  amount: number;
  payment_method: 'cash' | 'card';
  notes?: string;
}

export class FinanceOfflineService {
  private adapter = getOfflineStorageAdapter();
  private deviceId = getOrCreateDeviceId();
  private localSeq = 1;

  async processCustomerPayment(payload: CreateOfflineCustomerPaymentPayload) {
    const paymentId = generateUUIDv7();
    const localRef = generateLocalDocRef('PAY', this.deviceId, this.localSeq++);
    const timestamp = new Date().toISOString();

    const record = {
      id: paymentId,
      local_document_ref: localRef,
      customer_id: payload.customer_id,
      amount: payload.amount,
      payment_method: payload.payment_method,
      notes: payload.notes || null,
      created_at: timestamp,
      status: 'pending_sync',
    };

    await this.adapter.setItem('customer_payments', paymentId, record);

    // Update customer local balance
    const customer = await customersRepo.getById(payload.customer_id);
    if (customer) {
      await customersRepo.update(customer.id, {
        balance: customer.balance - payload.amount,
      });
    }

    await globalSyncEngine.enqueue({
      entity_name: 'create_customer_payment',
      operation_type: 'RPC',
      payload: record,
      priority: 'high',
      local_document_ref: localRef,
    });

    return record;
  }

  async processExpense(payload: CreateOfflineExpensePayload) {
    const expenseId = generateUUIDv7();
    const timestamp = new Date().toISOString();

    const record = {
      id: expenseId,
      category_id: payload.category_id,
      amount: payload.amount,
      payment_method: payload.payment_method,
      notes: payload.notes || null,
      created_at: timestamp,
    };

    await this.adapter.setItem('expenses', expenseId, record);

    await globalSyncEngine.enqueue({
      entity_name: 'expenses',
      operation_type: 'INSERT',
      payload: record,
      priority: 'medium',
    });

    return record;
  }
}

export const financeOfflineService = new FinanceOfflineService();
