import { COMMUNICATION_EVENT_TYPES, type CommunicationEventType } from "./types";

export const COMMUNICATION_SETTINGS_STORAGE_KEY = "market-hub.communication-settings.v1";
export const COMMUNICATION_SETTINGS_EVENT = "market-hub:communication-settings-changed";

export interface CommunicationSettings {
  version: 1;
  channels: {
    whatsapp: boolean;
    sms: boolean;
  };
  fields: {
    showCustomerName: boolean;
    showPrices: boolean;
    showDates: boolean;
    showReferences: boolean;
    showPaymentMethods: boolean;
    showBalances: boolean;
    showQuantities: boolean;
    showCompanyName: boolean;
    showCompanyPhone: boolean;
    showGreeting: boolean;
    showClosing: boolean;
  };
  events: Record<CommunicationEventType, boolean>;
}

export const DEFAULT_COMMUNICATION_SETTINGS: CommunicationSettings = {
  version: 1,
  channels: { whatsapp: true, sms: true },
  fields: {
    showCustomerName: true,
    showPrices: true,
    showDates: true,
    showReferences: true,
    showPaymentMethods: true,
    showBalances: true,
    showQuantities: true,
    showCompanyName: true,
    showCompanyPhone: true,
    showGreeting: true,
    showClosing: true,
  },
  events: {
    payment_received: true,
    payment_request: true,
    debt_reminder: true,
    invoice_created: true,
    invoice_share: true,
    purchase_invoice_share: true,
    statement_share: true,
    supplier_notice: true,
    general_customer_notice: true,
    milling_document_share: true,
  },
};

export function normalizeCommunicationSettings(value: unknown): CommunicationSettings {
  if (!value || typeof value !== "object") return DEFAULT_COMMUNICATION_SETTINGS;

  const candidate = value as Partial<CommunicationSettings>;
  const booleanValue = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

  return {
    version: 1,
    channels: {
      whatsapp: booleanValue(
        candidate.channels?.whatsapp,
        DEFAULT_COMMUNICATION_SETTINGS.channels.whatsapp,
      ),
      sms: booleanValue(candidate.channels?.sms, DEFAULT_COMMUNICATION_SETTINGS.channels.sms),
    },
    fields: {
      showCustomerName: booleanValue(candidate.fields?.showCustomerName, true),
      showPrices: booleanValue(candidate.fields?.showPrices, true),
      showDates: booleanValue(candidate.fields?.showDates, true),
      showReferences: booleanValue(candidate.fields?.showReferences, true),
      showPaymentMethods: booleanValue(candidate.fields?.showPaymentMethods, true),
      showBalances: booleanValue(candidate.fields?.showBalances, true),
      showQuantities: booleanValue(candidate.fields?.showQuantities, true),
      showCompanyName: booleanValue(candidate.fields?.showCompanyName, true),
      showCompanyPhone: booleanValue(candidate.fields?.showCompanyPhone, true),
      showGreeting: booleanValue(candidate.fields?.showGreeting, true),
      showClosing: booleanValue(candidate.fields?.showClosing, true),
    },
    events: Object.fromEntries(
      COMMUNICATION_EVENT_TYPES.map((event) => [
        event,
        booleanValue(candidate.events?.[event], DEFAULT_COMMUNICATION_SETTINGS.events[event]),
      ]),
    ) as CommunicationSettings["events"],
  };
}

export function getCommunicationSettings(): CommunicationSettings {
  if (typeof window === "undefined") return DEFAULT_COMMUNICATION_SETTINGS;

  try {
    const raw = window.localStorage.getItem(COMMUNICATION_SETTINGS_STORAGE_KEY);
    return raw ? normalizeCommunicationSettings(JSON.parse(raw)) : DEFAULT_COMMUNICATION_SETTINGS;
  } catch {
    return DEFAULT_COMMUNICATION_SETTINGS;
  }
}

export function cacheCommunicationSettings(value: unknown): CommunicationSettings {
  const settings = normalizeCommunicationSettings(value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COMMUNICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // The database remains the source of truth when browser storage is unavailable.
    }

    window.dispatchEvent(
      new CustomEvent<CommunicationSettings>(COMMUNICATION_SETTINGS_EVENT, { detail: settings }),
    );
  }

  return settings;
}
