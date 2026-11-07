import { buildWhatsAppLink, buildSmsLink, normalizeWhatsAppPhone } from "./phone";
import { formatConfiguredMessage } from "./message-formatter";
import {
  DEFAULT_COMMUNICATION_SETTINGS,
  getCommunicationSettings,
  normalizeCommunicationSettings,
  type CommunicationSettings,
} from "./settings";
import {
  COMMUNICATION_EVENT_TYPES,
  type CommunicationEventType,
  type MessageLanguage,
  type UnifiedCommunicationContext,
} from "./types";

export type TemplateDefinition = {
  ar: (ctx: UnifiedCommunicationContext) => string;
  en: (ctx: UnifiedCommunicationContext) => string;
};

const makeTemplate = (event: CommunicationEventType): TemplateDefinition => ({
  ar: (ctx) => formatConfiguredMessage({ ...ctx, event }, "ar", DEFAULT_COMMUNICATION_SETTINGS),
  en: (ctx) => formatConfiguredMessage({ ...ctx, event }, "en", DEFAULT_COMMUNICATION_SETTINGS),
});

export const TEMPLATES: Record<CommunicationEventType, TemplateDefinition> = Object.fromEntries(
  COMMUNICATION_EVENT_TYPES.map((event) => [event, makeTemplate(event)]),
) as Record<CommunicationEventType, TemplateDefinition>;

export function renderMessage(
  ctx: UnifiedCommunicationContext,
  settingsOverride?: CommunicationSettings,
) {
  const settings = normalizeCommunicationSettings(settingsOverride ?? getCommunicationSettings());
  const language: MessageLanguage = ctx.language ?? ctx.customer?.preferredLanguage ?? "ar";
  const eventEnabled = settings.events[ctx.event] ?? false;
  const text = eventEnabled ? formatConfiguredMessage(ctx, language, settings) : "";
  const recipientPhone = ctx.customer?.phone ?? null;
  const normalizedPhone = normalizeWhatsAppPhone(recipientPhone);
  const isValidRecipient = Boolean(normalizedPhone);
  const canSendWhatsApp = eventEnabled && settings.channels.whatsapp && isValidRecipient;
  const canSendSms = eventEnabled && settings.channels.sms && isValidRecipient;

  return {
    event: ctx.event,
    language,
    text,
    recipientPhone,
    normalizedPhone,
    isValidRecipient,
    eventEnabled,
    canSendWhatsApp,
    canSendSms,
    whatsAppUrl: canSendWhatsApp ? buildWhatsAppLink(recipientPhone, text) : null,
    smsUrl: canSendSms ? buildSmsLink(recipientPhone, text) : null,
  };
}
