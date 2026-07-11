/**
 * Hermes Acquisition Developer Panel adapter (Hotfix C1.0.1).
 *
 * `HermesAcquisitionDevPanel.tsx`'in "Dry-run Önizle" / "Güvenli Tarama
 * Çalıştır" düğmeleri sessiz kalıyordu: sonuç ve hata render'ı, config
 * durumu (`/api/hermes/acquisition/status`) yüklenmiş olma şartına bağlıydı
 * — o GET isteği yavaş kalır veya başarısız olursa, run isteği başarılı
 * (ya da blocked) dönse bile hiçbir şey ekrana çıkmıyordu.
 *
 * Bu modül, panelin request/response mantığını DOM'dan bağımsız, saf
 * fonksiyonlara ayırır — hem `node --test` ile doğrulanabilir hem de
 * component içinde render'dan önce çağrılır. Component düzeltmesi ayrıca
 * sonuç/hata bloğunu config-durumu şartından koparır (asıl kök neden).
 *
 * Dependency-free (no "@/" imports, no React, no browser API) — diğer v8+
 * adapter modülleriyle aynı konvansiyon.
 */

export type AcquisitionRunTriggerKind = "dry" | "safe";

/**
 * Client body'si — yapısal olarak SADECE bu iki alanı üretebilir. `dry`
 * `dryRun:true` gönderir (önizlemeyi açar); `safe` hiç `dryRun` göndermez
 * (server-side policy zaten dry-run'ı env'den okur — client onu KAPATAMAZ).
 * Policy limiti, founder onayı, autoSend, secret veya provider bilgisi bu
 * fonksiyonun döndürebileceği hiçbir şekilde yer alamaz.
 */
export function buildAcquisitionRunRequestBody(
  kind: AcquisitionRunTriggerKind,
): { trigger: "developer"; dryRun: true } | { trigger: "developer" } {
  return kind === "dry" ? { trigger: "developer", dryRun: true } : { trigger: "developer" };
}

export type AcquisitionRunResultLike = {
  status: string;
  dryRun: boolean;
  selectedRegionsSafe: string[];
  summaryTr: string;
  blockingReasons: string[];
  evaluatedCount: number;
  missionCandidateCount: number;
  externalRequestCount: number;
};

export type AcquisitionRunOutcome =
  | { kind: "result"; result: AcquisitionRunResultLike }
  | { kind: "error"; messageTr: string };

const GENERIC_SERVER_ERROR_TR = "Çalıştırma başarısız oldu.";
export const ACQUISITION_NETWORK_ERROR_TR = "Dry-run başlatılamadı. Bağlantı sorunu oluştu.";

function hasStringField(data: unknown, field: string): data is Record<string, string> {
  return (
    typeof data === "object" &&
    data !== null &&
    field in data &&
    typeof (data as Record<string, unknown>)[field] === "string"
  );
}

function isAcquisitionRunResultLike(data: unknown): data is AcquisitionRunResultLike {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.status === "string" &&
    typeof d.dryRun === "boolean" &&
    Array.isArray(d.blockingReasons) &&
    typeof d.summaryTr === "string"
  );
}

/**
 * Turns a raw fetch response (already `.json()`-parsed) into either a
 * render-ready result or a founder/developer-safe Turkish error message.
 * Never throws; never passes through a raw provider payload or an English
 * exception message — an unexpected/malformed body degrades to the
 * generic fallback.
 */
export function resolveAcquisitionRunResponse(input: {
  ok: boolean;
  data: unknown;
}): AcquisitionRunOutcome {
  if (!input.ok) {
    const messageTr = hasStringField(input.data, "error") && input.data.error.trim()
      ? input.data.error
      : GENERIC_SERVER_ERROR_TR;
    return { kind: "error", messageTr };
  }
  if (!isAcquisitionRunResultLike(input.data)) {
    return { kind: "error", messageTr: GENERIC_SERVER_ERROR_TR };
  }
  return {
    kind: "result",
    result: {
      status: input.data.status,
      dryRun: input.data.dryRun,
      selectedRegionsSafe: Array.isArray((input.data as Record<string, unknown>).selectedRegionsSafe)
        ? ((input.data as Record<string, unknown>).selectedRegionsSafe as string[])
        : [],
      summaryTr: input.data.summaryTr,
      blockingReasons: input.data.blockingReasons,
      evaluatedCount:
        typeof (input.data as Record<string, unknown>).evaluatedCount === "number"
          ? ((input.data as Record<string, unknown>).evaluatedCount as number)
          : 0,
      missionCandidateCount:
        typeof (input.data as Record<string, unknown>).missionCandidateCount === "number"
          ? ((input.data as Record<string, unknown>).missionCandidateCount as number)
          : 0,
      externalRequestCount:
        typeof (input.data as Record<string, unknown>).externalRequestCount === "number"
          ? ((input.data as Record<string, unknown>).externalRequestCount as number)
          : 0,
    },
  };
}

/** Turkish labels for `AcquisitionRunResultLike.status` — Developer Mode may use technical-adjacent wording, never a raw enum. */
export const ACQUISITION_RUN_STATUS_LABELS_TR: Record<string, string> = {
  idle: "Beklemede",
  eligible: "Uygun",
  running: "Çalışıyor",
  completed: "Tamamlandı",
  partial: "Kısmi Tamamlandı",
  blocked: "Engellendi",
  failed: "Başarısız",
};

export function acquisitionRunStatusLabelTr(status: string): string {
  return ACQUISITION_RUN_STATUS_LABELS_TR[status] ?? status;
}

/** Row labels for the result panel — dry-run copy is forward-looking ("planned"), a real run's is past-tense ("actual"). */
export function acquisitionResultFieldLabelsTr(dryRun: boolean): {
  evaluated: string;
  externalRequests: string;
  missionCandidates: string;
} {
  return dryRun
    ? {
        evaluated: "Değerlendirilecek İşletme",
        externalRequests: "Planlanan Dış İstek",
        missionCandidates: "Planlanan Satış İşi Adayı",
      }
    : {
        evaluated: "Değerlendirilen İşletme",
        externalRequests: "Yapılan Dış İstek",
        missionCandidates: "Oluşturulan Satış İşi Adayı",
      };
}
