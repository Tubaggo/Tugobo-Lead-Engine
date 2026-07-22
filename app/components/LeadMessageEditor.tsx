"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { whatsappLinkWithText, type ScoredLead } from "@/app/lib/leads";
import * as operationalState from "@/app/lib/operational-state/client";
import { OperationalStateError } from "@/app/lib/operational-state/client";
import { TONES, type Tone } from "@/app/lib/outreach/contract";
import type { OutreachStance } from "@/app/lib/outreach/lifecycle";
import {
  generateOutreachStylePack,
  STYLE_TO_TONE,
  type StyleKey,
} from "@/app/lib/outreach/generate-client";
import {
  applyGeneratedDrafts,
  applyManualDraft,
  emptyMessageWorkspace,
  isStaleCopyDraft,
  MAX_WORKSPACE_MESSAGE_LENGTH,
  messageWorkspaceGuard,
  previousWorkspaceMessages,
  type GeneratedDraftInput,
  type LeadMessageWorkspaceState,
  type WorkspaceGuard,
} from "@/app/lib/outreach/workspace";

/**
 * The lead's message editor: produce, edit, save, copy, open by hand.
 *
 * Was a standalone "Mesaj Çalışma Alanı" section in the lead drawer, sitting
 * below an Operation Guide that showed the same message read-only. Two surfaces
 * for one job made the panel long and made the founder scroll away from the
 * card they were already looking at, so the editor lost its own chrome and now
 * lives *inside* whichever surface owns the message — the Operation Guide in
 * the drawer, the AI message modal elsewhere.
 *
 * The data model, hook, persistence and generation engine are unchanged: both
 * mount points read and write the same server-side record, so a draft written
 * in one is the draft the other shows.
 *
 * This component never sends. `wa.me` is opened with the text prefilled and
 * the founder presses send in WhatsApp themselves.
 */

const TONE_LABELS: Record<Tone, string> = {
  soft: "Yumuşak",
  direct: "Direkt",
  consultative: "Danışman",
};

function toneOf(style: StyleKey): Tone {
  return STYLE_TO_TONE[style];
}

function formatStamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readWorkspace(leadId: string): LeadMessageWorkspaceState {
  return operationalState.readMessageWorkspace(leadId) ?? emptyMessageWorkspace();
}

/** Founder-facing label for where a stored draft came from. */
function draftSourceLabel(
  source: "provider" | "fallback" | "manual" | undefined,
): string | null {
  if (source === "provider") return "AI üretimi";
  if (source === "manual") return "Manuel düzenleme";
  if (source === "fallback") return "Güvenli şablon";
  return null;
}

/* -------------------------------------------------------------------------- */
/* hook                                                                       */
/* -------------------------------------------------------------------------- */

export type UseLeadMessageWorkspaceInput = {
  lead: ScoredLead;
  guard: WorkspaceGuard;
  /** Relationship position the copy is written from. */
  stance: OutreachStance;
  /** Generate on open when this lead has no stored draft for the active tone. */
  autoGenerate: boolean;
  onDraftSaved?: (leadId: string, tone: Tone) => void;
};

/**
 * Caller contract: mount this under `key={lead.id}`.
 *
 * All unsaved text lives in local state, so a new lead has to arrive as a new
 * mount. Reusing the instance across leads would carry one lead's draft into
 * another's editor.
 */
export function useLeadMessageWorkspace({
  lead,
  guard,
  stance,
  autoGenerate,
  onDraftSaved,
}: UseLeadMessageWorkspaceInput) {
  const leadId = lead.id;

  /*
   * The mirror is a module singleton, so a write from the other open surface
   * has to reach this one. `version` is bumped by the store's change channel;
   * everything derived below reads through it.
   */
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      operationalState.subscribeLeadState((changedId) => {
        if (changedId === null || changedId === leadId) setVersion((v) => v + 1);
      }),
    [leadId],
  );

  const persisted = useMemo(
    () => readWorkspace(leadId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leadId, version],
  );

  const [activeTone, setActiveToneState] = useState<Tone>(
    () => readWorkspace(leadId).activeTone,
  );
  /** Unsaved text per tone. Absent means "showing the saved draft". */
  const [editing, setEditing] = useState<Partial<Record<Tone, string>>>({});
  const [busy, setBusy] = useState<null | "generating" | "saving">(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const nonceRef = useRef(0);
  const savedDraft = persisted.drafts[activeTone];
  const savedMessage = savedDraft?.message ?? "";
  const pendingEdit = editing[activeTone];
  const draftText = pendingEdit ?? savedMessage;
  const dirty = pendingEdit !== undefined && pendingEdit !== savedMessage;

  /**
   * Applies a change to the freshest server copy and stores it.
   *
   * `build` takes the base state rather than a finished object so a revision
   * conflict can be resolved by replaying the founder's change onto the copy
   * the other device wrote, instead of dropping either one.
   */
  const persist = useCallback(
    async (
      build: (base: LeadMessageWorkspaceState) => LeadMessageWorkspaceState,
    ): Promise<void> => {
      try {
        await operationalState.patchMessageWorkspace(leadId, build(readWorkspace(leadId)));
      } catch (err) {
        if (err instanceof OperationalStateError && err.status === 409) {
          // The client already pulled the server copy back into the mirror.
          await operationalState.patchMessageWorkspace(
            leadId,
            build(readWorkspace(leadId)),
          );
          return;
        }
        throw err;
      }
    },
    [leadId],
  );

  const generate = useCallback(
    async (mode: "generate" | "regenerate") => {
      if (!guard.canGenerate) return;
      // Double-click guard: a request already in flight owns the workspace.
      if (busy !== null) return;

      setBusy("generating");
      setGenerateError(null);
      try {
        const base = readWorkspace(leadId);
        nonceRef.current =
          mode === "regenerate"
            ? nonceRef.current + 1
            : Math.max(nonceRef.current, base.recentMessages.length);

        const pack = await generateOutreachStylePack(lead, {
          stance,
          regenerateNonce: nonceRef.current,
          previousMessages: previousWorkspaceMessages(base),
          tone: activeTone,
        });

        const entries: GeneratedDraftInput[] = (
          Object.keys(pack.styles) as StyleKey[]
        ).map((style) => ({
          tone: toneOf(style),
          message: pack.styles[style] || pack.fallback,
          source: pack.sourceByStyle[style],
          variationAngle: pack.angleLabelByStyle[style] || undefined,
          usedSignalKeys:
            toneOf(style) === activeTone ? pack.usedSignalKeys : undefined,
          generationId: pack.generationId,
        }));

        await persist((current) =>
          applyGeneratedDrafts(current, {
            entries,
            activeTone,
            now: new Date().toISOString(),
            generationId: pack.generationId,
          }),
        );
        // A fresh generation replaces what is on screen for every tone; an
        // unsaved edit the founder made before asking for new copy is exactly
        // what they were replacing.
        setEditing({});
      } catch (err) {
        // The stored draft is untouched, so the founder keeps a usable message.
        setGenerateError(
          err instanceof Error ? err.message : "Mesaj oluşturulamadı.",
        );
      } finally {
        setBusy(null);
      }
    },
    [activeTone, busy, guard.canGenerate, lead, leadId, persist, stance],
  );

  const saveManual = useCallback(async () => {
    if (busy !== null || !dirty) return;
    const text = (pendingEdit ?? "").trim();
    if (text.length > MAX_WORKSPACE_MESSAGE_LENGTH) {
      setSaveError(`Mesaj en fazla ${MAX_WORKSPACE_MESSAGE_LENGTH} karakter olabilir.`);
      return;
    }

    setBusy("saving");
    setSaveError(null);
    try {
      await persist((current) =>
        applyManualDraft(current, activeTone, text, new Date().toISOString()),
      );
      // Only now is the local copy redundant; on failure it stays put so the
      // founder can retry without retyping.
      setEditing((current) => {
        const next = { ...current };
        delete next[activeTone];
        return next;
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
      onDraftSaved?.(leadId, activeTone);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Taslak kaydedilemedi. Metniniz korundu, tekrar deneyebilirsiniz.",
      );
    } finally {
      setBusy(null);
    }
  }, [activeTone, busy, dirty, leadId, onDraftSaved, pendingEdit, persist]);

  const setDraftText = useCallback(
    (value: string) => {
      setSaveError(null);
      setEditing((current) => ({
        ...current,
        [activeTone]: value.slice(0, MAX_WORKSPACE_MESSAGE_LENGTH),
      }));
    },
    [activeTone],
  );

  const setActiveTone = useCallback((tone: Tone) => {
    setActiveToneState(tone);
    setSaveError(null);
    setGenerateError(null);
  }, []);

  /*
   * Auto-generation is opt-in and happens at most once per lead: the modal is
   * opened in order to get a message, the detail panel is not. Either way an
   * existing draft is never overwritten without the founder asking.
   */
  const autoGeneratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoGenerate || !guard.canGenerate) return;
    if (autoGeneratedFor.current === leadId) return;
    if (readWorkspace(leadId).drafts[activeTone]) return;
    autoGeneratedFor.current = leadId;
    // Starting a request on mount is the point of this effect; the state it
    // eventually sets arrives from the network, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void generate("generate");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, guard.canGenerate, leadId]);

  return {
    persisted,
    activeTone,
    setActiveTone,
    draftText,
    setDraftText,
    dirty,
    savedDraft,
    busy,
    generateError,
    saveError,
    savedFlash,
    generate,
    saveManual,
    hasAnyDraft: TONES.some((tone) => Boolean(persisted.drafts[tone])),
  };
}

/* -------------------------------------------------------------------------- */
/* component                                                                  */
/* -------------------------------------------------------------------------- */

export type LeadMessageEditorProps = {
  lead: ScoredLead;
  doNotContact: boolean;
  /** Relationship position the copy is written from. */
  stance: OutreachStance;
  /** Rendered as a plain badge so a won/lost lead still explains itself. */
  stageLabel?: string | null;
  /**
   * Heading placed above the action row.
   *
   * The Operation Guide passes its existing "Hızlı Aksiyonlar" label so the
   * card keeps the section it always had; the modal omits it.
   */
  actionsLabel?: string | null;
  autoGenerate?: boolean;
  onMessageCopied?: (leadId: string, tone: Tone, preview: string) => void;
  onWhatsappOpened?: (leadId: string, tone: Tone, preview: string) => void;
  onDraftSaved?: (leadId: string, tone: Tone) => void;
  onMarkPrepared?: (leadId: string) => void;
  onMarkOpened?: (leadId: string) => void;
  onMarkContacted?: (leadId: string) => void;
};

/**
 * The message editor body — tone, draft, actions, history.
 *
 * Deliberately chrome-free: no card, no border, no heading of its own. It is
 * dropped inside whatever surface owns the message (the Operation Guide in the
 * lead drawer, the AI message modal elsewhere), so there is exactly one editor
 * per lead rather than one per screen that wanted to show a message.
 *
 * Keyed on the lead so a different lead arrives as a fresh mount: unsaved text
 * lives in local state, and remounting is what guarantees one lead's
 * half-written message can never surface under another's name.
 */
export default function LeadMessageEditor(props: LeadMessageEditorProps) {
  return <LeadMessageEditorBody key={props.lead.id} {...props} />;
}

function LeadMessageEditorBody({
  lead,
  doNotContact,
  stance,
  stageLabel = null,
  actionsLabel = null,
  autoGenerate = false,
  onMessageCopied,
  onWhatsappOpened,
  onDraftSaved,
  onMarkPrepared,
  onMarkOpened,
  onMarkContacted,
}: LeadMessageEditorProps) {
  const guard = useMemo(
    () =>
      messageWorkspaceGuard({
        doNotContact,
        hasWhatsAppChannel: Boolean(whatsappLinkWithText(lead.phone, "x")),
      }),
    [doNotContact, lead.phone],
  );

  const ws = useLeadMessageWorkspace({
    lead,
    guard,
    stance,
    autoGenerate,
    onDraftSaved,
  });

  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const waLink = guard.canOpenWhatsApp
    ? whatsappLinkWithText(lead.phone, ws.draftText)
    : null;
  const busyAny = ws.busy !== null;
  const emptyDraft = ws.draftText.trim().length === 0;

  const handleCopy = async () => {
    if (emptyDraft) return;
    try {
      await navigator.clipboard.writeText(ws.draftText);
      setCopied(true);
      onMarkPrepared?.(lead.id);
      onMessageCopied?.(lead.id, ws.activeTone, ws.draftText);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleWhatsApp = () => {
    if (!waLink) return;
    window.open(waLink, "_blank");
    onMarkOpened?.(lead.id);
    onWhatsappOpened?.(lead.id, ws.activeTone, ws.draftText);
    onMarkContacted?.(lead.id);
  };

  const updatedLabel = formatStamp(ws.savedDraft?.updatedAt);
  const sourceLabel = draftSourceLabel(ws.savedDraft?.source);

  return (
    <div>
      <div className="space-y-2">
        {/* Tone selection. Each tone keeps its own draft; switching never
            discards the one you are leaving. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            Ton
          </span>
          {TONES.map((tone) => {
            const hasDraft = Boolean(ws.persisted.drafts[tone]);
            return (
              <button
                key={tone}
                type="button"
                onClick={() => ws.setActiveTone(tone)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                  ws.activeTone === tone
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {TONE_LABELS[tone]}
                {hasDraft ? (
                  <span className="ml-1 text-[9px] text-emerald-300">●</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {sourceLabel ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[9px] text-zinc-400">
              {sourceLabel}
            </span>
          ) : null}
          {ws.savedDraft?.variationAngle ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[9px] text-zinc-400">
              {ws.savedDraft.variationAngle}
            </span>
          ) : null}
          {stageLabel ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[9px] text-zinc-400">
              {stageLabel}
            </span>
          ) : null}
          {updatedLabel ? (
            <span className="text-[9px] text-zinc-600">{updatedLabel}</span>
          ) : null}
          {ws.busy === "generating" ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span
                className="h-3 w-3 animate-spin rounded-full border border-emerald-400/30 border-t-emerald-400"
                aria-hidden
              />
              Mesaj oluşturuluyor…
            </span>
          ) : null}
          {ws.dirty ? (
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-px text-[9px] text-amber-200">
              Kaydedilmedi
            </span>
          ) : null}
          {ws.savedFlash ? (
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-px text-[9px] text-emerald-200">
              Kaydedildi
            </span>
          ) : null}
        </div>

        {/*
          An old-tone draft is offered for refresh, never replaced silently:
          the founder may already have sent this exact text.
        */}
        {isStaleCopyDraft(ws.savedDraft) && !ws.dirty && guard.canGenerate ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[11px] text-amber-200">
              Bu taslak eski mesaj tonuyla yazıldı.
            </p>
            <button
              type="button"
              onClick={() => void ws.generate("regenerate")}
              disabled={busyAny}
              className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Yeni tonla güncelle
            </button>
          </div>
        ) : null}

        {doNotContact ? (
          <p className="rounded-md border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
            Bu lead &quot;İletişime geçme&quot; olarak işaretli. Taslak görüntülenebilir ve
            düzenlenebilir; yeni mesaj üretimi ve WhatsApp açma kapalıdır.
          </p>
        ) : null}

        <textarea
          value={ws.draftText}
          onChange={(e) => ws.setDraftText(e.target.value ?? "")}
          maxLength={MAX_WORKSPACE_MESSAGE_LENGTH}
          rows={5}
          placeholder={
            guard.canGenerate
              ? `Bu ton için henüz mesaj yok. "${TONE_LABELS[ws.activeTone]}" tonunda mesaj oluşturun veya kendiniz yazın.`
              : "Bu ton için kayıtlı mesaj yok."
          }
          className="min-h-[110px] w-full resize-y rounded-md border border-white/8 bg-zinc-900/40 px-3 py-2.5 text-[12px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-500/20"
        />

        <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-600">
          <span>Mesaj tamamen manuel gönderilir. Sistem hiçbir mesajı otomatik göndermez.</span>
          <span className="shrink-0">
            {ws.draftText.length}/{MAX_WORKSPACE_MESSAGE_LENGTH}
          </span>
        </div>

        {ws.generateError ? (
          <p className="text-[11px] text-rose-300">
            {ws.generateError} Mevcut taslak korundu.
          </p>
        ) : null}
        {ws.saveError ? (
          <p className="text-[11px] text-rose-300">
            {ws.saveError} Metniniz ekranda duruyor, tekrar deneyebilirsiniz.
          </p>
        ) : null}
        {!guard.canOpenWhatsApp && guard.whatsAppBlockedReason && !doNotContact ? (
          <p className="text-[11px] text-amber-200">{guard.whatsAppBlockedReason}</p>
        ) : null}

        {actionsLabel ? (
          <p className="pt-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {actionsLabel}
          </p>
        ) : null}
        {/* Wraps in the narrow drawer column rather than overflowing it. */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void ws.generate(ws.savedDraft ? "regenerate" : "generate")}
            disabled={!guard.canGenerate || busyAny}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ws.busy === "generating"
              ? "Üretiliyor…"
              : ws.savedDraft
                ? "Yeniden Üret"
                : "Mesaj Oluştur"}
          </button>
          <button
            type="button"
            onClick={() => void ws.saveManual()}
            disabled={!ws.dirty || busyAny}
            className="rounded-md border border-zinc-700/40 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ws.busy === "saving" ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={emptyDraft}
            className="rounded-md border border-zinc-700/40 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Kopyalandı!" : "Kopyala"}
          </button>
          {waLink && !emptyDraft ? (
            <button
              type="button"
              onClick={handleWhatsApp}
              className="rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-medium text-green-300 transition hover:bg-green-500/20"
            >
              WhatsApp&apos;ta Aç
            </button>
          ) : (
            <span
              title={guard.whatsAppBlockedReason ?? "Mesaj boş"}
              aria-disabled="true"
              className="cursor-not-allowed rounded-md border border-zinc-700/40 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-600"
            >
              WhatsApp&apos;ta Aç
            </span>
          )}
        </div>

        {ws.persisted.recentMessages.length > 0 ? (
          <div className="rounded-md border border-white/10 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              <span>Son varyasyonlar ({ws.persisted.recentMessages.length})</span>
              <span aria-hidden>{historyOpen ? "−" : "+"}</span>
            </button>
            {historyOpen ? (
              <ul className="space-y-1.5 border-t border-white/10 px-2.5 py-2">
                {ws.persisted.recentMessages.map((entry) => (
                  <li key={entry.id} className="rounded-md bg-black/30 p-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                      <span>
                        {TONE_LABELS[entry.tone]}
                        {entry.variationAngle ? ` · ${entry.variationAngle}` : ""}
                      </span>
                      <span>{formatStamp(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-zinc-300">
                      {entry.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        ws.setActiveTone(entry.tone);
                        ws.setDraftText(entry.message);
                      }}
                      className="mt-1.5 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                    >
                      Bu metni kullan
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
