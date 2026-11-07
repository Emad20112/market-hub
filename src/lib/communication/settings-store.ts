import { useCallback, useEffect, useState } from "react";
import { untypedTable } from "@/lib/statements/untyped";
import {
  cacheCommunicationSettings,
  COMMUNICATION_SETTINGS_EVENT,
  COMMUNICATION_SETTINGS_STORAGE_KEY,
  getCommunicationSettings,
  normalizeCommunicationSettings,
  type CommunicationSettings,
} from "./settings";

let cloudLoad: Promise<CommunicationSettings> | null = null;
let cacheRevision = 0;
let writeQueue: Promise<unknown> = Promise.resolve();

const originalCacheCommunicationSettings = cacheCommunicationSettings;

function updateCache(value: unknown): CommunicationSettings {
  cacheRevision += 1;
  return originalCacheCommunicationSettings(value);
}

async function readCloudSettings(): Promise<CommunicationSettings> {
  const revisionAtStart = cacheRevision;
  try {
    const { data, error } = await untypedTable<{ id: number; catalog_modules: unknown }>(
      "company_settings",
    )
      .select("id,catalog_modules")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return getCommunicationSettings();

    const catalog =
      data.catalog_modules && typeof data.catalog_modules === "object"
        ? (data.catalog_modules as Record<string, unknown>)
        : {};
    const stored = catalog.communications;
    const next =
      stored === undefined ? getCommunicationSettings() : normalizeCommunicationSettings(stored);

    if (revisionAtStart === cacheRevision) return updateCache(next);
    return getCommunicationSettings();
  } catch {
    return getCommunicationSettings();
  }
}

export function loadCommunicationSettings(): Promise<CommunicationSettings> {
  if (!cloudLoad) {
    cloudLoad = readCloudSettings().finally(() => {
      cloudLoad = null;
    });
  }
  return cloudLoad;
}

function writeCloudSettings(settings: CommunicationSettings): Promise<void> {
  const task = writeQueue.then(async () => {
    const { data, error } = await untypedTable<{ id: number; catalog_modules: unknown }>(
      "company_settings",
    )
      .select("id,catalog_modules")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("تعذر العثور على إعدادات المنشأة لحفظ إعدادات الرسائل.");

    const catalog =
      data.catalog_modules && typeof data.catalog_modules === "object"
        ? (data.catalog_modules as Record<string, unknown>)
        : {};
    const { data: saved, error: saveError } = await untypedTable("company_settings")
      .update({ catalog_modules: { ...catalog, communications: settings } })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();

    if (saveError) throw new Error(saveError.message);
    if (!saved) throw new Error("لم تُحفظ إعدادات الرسائل. تحقق من صلاحيات حسابك ثم أعد المحاولة.");
  });

  writeQueue = task.catch(() => undefined);
  return task;
}

export async function saveCommunicationSettings(value: unknown): Promise<CommunicationSettings> {
  const settings = normalizeCommunicationSettings(value);
  await writeCloudSettings(settings);
  return updateCache(settings);
}

export function useCommunicationSettings(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [settings, setSettings] = useState(getCommunicationSettings);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let active = true;
    const handleSettingsChange = (event: Event) => {
      const detail = (event as CustomEvent<CommunicationSettings>).detail;
      if (detail) setSettings(normalizeCommunicationSettings(detail));
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === COMMUNICATION_SETTINGS_STORAGE_KEY) {
        setSettings(getCommunicationSettings());
      }
    };

    window.addEventListener(COMMUNICATION_SETTINGS_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleStorageChange);
    void loadCommunicationSettings()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      window.removeEventListener(COMMUNICATION_SETTINGS_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [enabled]);

  const save = useCallback(async (next: CommunicationSettings) => {
    const saved = await saveCommunicationSettings(next);
    setSettings(saved);
  }, []);

  return { settings, isLoading, save };
}
