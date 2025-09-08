import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FaCheckCircle, FaClock, FaSave, FaTrash, FaTimes, FaCalendarAlt,
  FaCreditCard, FaUser, FaCarSide, FaEdit, FaExclamationTriangle, FaInfoCircle,
  FaPlay, FaBan, FaPlus
} from "react-icons/fa";

import {
  updateBooking as editBayBooking,
  deleteBooking as deleteBayBooking,
  setBookingStatus,
  fetchBooking,
  type BayBookingRead as BayBooking,
} from "@/services/baybookingService";

import { completeBookingWithTime } from "@/services/bookingsService";
import { getServiceItem, type WorkshopServiceItem } from "@/services/workshopserviceitemService";

import styles from "./css/BookingDetailsModal.module.css";
import UpsellModal from "@/components/booking/upsell/UpsellModal";
import type {UpsellStatus} from "@/services/upsellService.ts";

// --- Helpers ---
const toLocalInputValue = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toISOStringFromLocal = (local: string) => new Date(local).toISOString();
const formatCurrencySEK = (ore?: number | null) =>
  ore == null ? "–" : (ore / 100).toLocaleString("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 });

type Props = {
  booking: BayBooking;
  onClose: () => void;
  onRefetch?: () => Promise<void> | void;
};

// Tar t.ex. "1 234", "1.234,5", "1234,50", "1234.50", "199" → öre (NETTO)
// Tillåter även "123400 öre" / "123400 ore" (legacy-variant där man skriver öre direkt)
const parsePriceToOre = (raw: string): { ore: number | null; valid: boolean } => {
  if (!raw) return { ore: null, valid: true };
  let s = raw.trim();

  // Legacy: "öre/ore" = tolka som öre direkt
  if (/(öre|ore)\s*$/i.test(s)) {
    const digits = s.replace(/\D/g, "");
    const ore = digits ? parseInt(digits, 10) : 0;
    return { ore, valid: true };
  }

  // Ta bort mellanslag inkl. NBSP
  s = s.replace(/[\s\u00A0]/g, "");

  // Bestäm decimalsymbol
  let decimal: "," | "." | null = null;
  if (s.includes(",")) {
    s = s.replace(/\./g, ""); // anta . är tusental
    decimal = ",";
  } else if (s.includes(".")) {
    decimal = ".";
  }

  let intPart = s;
  let fracPart = "";

  if (decimal) {
    const parts = s.split(decimal);
    if (parts.length > 2) return { ore: null, valid: false };
    [intPart, fracPart] = parts;
  }

  // Endast siffror
  intPart = intPart.replace(/\D/g, "");
  fracPart = fracPart.replace(/\D/g, "");

  // Max 2 decimaler
  if (fracPart.length > 2) fracPart = fracPart.slice(0, 2);

  if (intPart === "") intPart = "0";
  const kronor = parseInt(intPart, 10) || 0;
  const öre = (fracPart === "" ? 0 : parseInt(fracPart.padEnd(2, "0"), 10)) + kronor * 100;
  return { ore: öre, valid: true };
};

// --- Små UI-subkomponenter ---
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; Icon: any; tone: string }> = {
    scheduled: { label: "Bokad", Icon: FaClock, tone: "scheduled" },
    in_progress: { label: "Pågår", Icon: FaPlay, tone: "inprogress" },
    completed: { label: "Klar", Icon: FaCheckCircle, tone: "completed" },
    canceled: { label: "Avbokad", Icon: FaBan, tone: "canceled" },
  };
  const M = map[status] ?? map.scheduled;
  return (
    <span className={`${styles.statusChip} ${styles[`tone-${M.tone}`]}`} aria-live="polite">
      <M.Icon /> {M.label}
    </span>
  );
};

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ icon, title, children, right }) => (
  <section className={styles.card} aria-label={title}>
    <header className={styles.cardHeader}>
      <div className={styles.cardHeaderLeft}>{icon}<h3>{title}</h3></div>
      {right && <div className={styles.cardHeaderRight}>{right}</div>}
    </header>
    <div className={styles.cardBody}>{children}</div>
  </section>
);

const RadioTile: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  description?: string;
  icon: React.ReactNode;
  name: string;
  value: string;
}> = ({ checked, disabled, onChange, title, description, icon, name, value }) => (
  <label className={`${styles.tile} ${checked ? styles.tileChecked : ""} ${disabled ? styles.tileDisabled : ""}`}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} />
    <div className={styles.tileIcon}>{icon}</div>
    <div className={styles.tileText}>
      <div className={styles.tileTitle}>{title}</div>
      {description && <div className={styles.tileDesc}>{description}</div>}
    </div>
  </label>
);

type Upsell = {
  id: number;
  title: string;
  price_gross_ore: number;
  status: UpsellStatus;
  sent_at?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
};

const BookingDetailsModal: React.FC<Props> = ({ booking, onClose, onRefetch }) => {
  const isCompleted = booking.status === "completed";

  const [remountKey, setRemountKey] = useState<number>(0);
  const [title, setTitle] = useState(booking.title);
  const [description, setDescription] = useState(booking.description ?? "");
  const [startAt, setStartAt] = useState(toLocalInputValue(booking.start_at));
  const [endAt, setEndAt] = useState(toLocalInputValue(booking.end_at));

  const [editMode, setEditMode] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceItem, setServiceItem] = useState<WorkshopServiceItem | null>(null);
  const [siLoading, setSiLoading] = useState<boolean>(false);
  const [upsellOpen, setUpsellOpen] = useState(false)

  // NYTT: Visa "Sparat" chip en kort stund efter lyckad save
  const [justSaved, setJustSaved] = useState(false);

  // Moms + pris (DB bär NETTO)
  const vatPercent = (booking as any)?.vat_percent ?? (serviceItem?.vat_percent ?? 0);
  const priceNet = (booking as any)?.price_net_ore ?? null;
  const finalNet = (booking as any)?.final_price_ore ?? priceNet;
  const grossBase = finalNet ?? priceNet;
  const displayGross = grossBase != null ? Math.round(grossBase * (1 + (vatPercent / 100))) : null;

  // Defaultvaraktighet
  const defaultDurationMin = useMemo(() => {
    const s = new Date(booking.start_at).getTime();
    const e = new Date(booking.end_at).getTime();
    return Math.max(0, Math.round((e - s) / 60000));
  }, [booking.start_at, booking.end_at]);

  const [actualMinutesStr, setActualMinutesStr] = useState<string>("");
  const userHasTypedMinutes = actualMinutesStr.trim() !== "";

  const hasServiceItemId = useMemo(() => (booking as any)?.service_item_id != null, [booking]);
  const normalizedPriceType = (serviceItem?.price_type ?? "").toString().toLowerCase();
  const canChargeTime = !!serviceItem && normalizedPriceType === "hourly" && serviceItem.hourly_rate_ore != null;

  type PricingChoice = "keep_estimate" | "charge_time" | "custom_final" | null;
  const [pricingChoice, setPricingChoice] = useState<PricingChoice>(null);
  const [customFinalInput, setCustomFinalInput] = useState<string>("");
  const [customFinalValid, setCustomFinalValid] = useState<boolean>(true);
  const [customFinalOre, setCustomFinalOre] = useState<number | null>(null);
  const baseGrossOre = (booking as any)?.base_gross_ore ?? null;
  const upsellsAcceptedGrossOre = (booking as any)?.upsells_accepted_gross_ore ?? 0;
  const totalGrossOre = (booking as any)?.total_gross_ore ?? baseGrossOre;

  const calcNetFromGross = (grossOre: number | null | undefined, vat: number | null | undefined) => {
    if (grossOre == null || vat == null) return null;
    const factor = 1 + vat / 100;
    return Math.round(grossOre / factor);
  };

  const netFromGrossOre = calcNetFromGross(displayGross, vatPercent ?? 25);

  // 🔒 Lås bakgrundens scroll medan modalen är öppen
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Synka formulär när booking ändras
  useEffect(() => {
    setTitle(booking.title);
    setDescription(booking.description ?? "");
    setStartAt(toLocalInputValue(booking.start_at));
    setEndAt(toLocalInputValue(booking.end_at));
    setError(null);
    setBusy(false);
    if (booking.status === "completed") {
      setEditMode(false);
      setCompleteOpen(false);
    }
  }, [booking.id, booking.title, booking.description, booking.start_at, booking.end_at, booking.status, finalNet]);


  const UpsellChip: React.FC<{ status: UpsellStatus }> = ({ status }) => {
    const map: Record<UpsellStatus, { label: string; tone: string; Icon: any }> = {
      draft:            { label: "Utkast",          tone: "upsell-draft",     Icon: FaEdit },
      pending_customer: { label: "Väntar på svar",  tone: "upsell-pending",    Icon: FaClock },
      accepted:         { label: "Godkänd",         tone: "upsell-accepted",   Icon: FaCheckCircle },
      declined:         { label: "Nekad",           tone: "upsell-declined",   Icon: FaTimes },
      expired:          { label: "Utgången",        tone: "upsell-expired",    Icon: FaExclamationTriangle },
      cancelled:        { label: "Avbruten",        tone: "upsell-cancelled",  Icon: FaBan },
    };
    const M = map[status];
    return (
      <span className={`${styles.statusChip} ${styles[M.tone]}`}>
        <M.Icon /> {M.label}
      </span>
    );
  };


  // litet format-hjälpmedel
  const sek = (ore?: number | null) =>
    typeof ore === "number" ? `${(ore/100).toFixed(0)} kr` : "–";

  const fmtTime = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString(); // byt till din lokala formatter om du vill
  };
  // Hämta serviceitem
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSiLoading(true);
        let id = (booking as any)?.service_item_id as number | undefined;
        if (!id) {
          try {
            const full = await fetchBooking(booking.id);
            id = (full as any)?.service_item_id ?? undefined;
          } catch { /* noop */ }
        }
        if (!id) { if (!cancelled) setServiceItem(null); return; }
        const si = await getServiceItem(id);
        if (!cancelled) setServiceItem(si);
      } catch {
        if (!cancelled) setServiceItem(null);
      } finally {
        if (!cancelled) setSiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [booking.id, (booking as any)?.service_item_id]);

  // --- Handlers (oförändrad logik) ---
  const handleSave = async () => {
    setBusy(true); setError(null);
    try {
      // Validera tid: start <= slut
      if (editMode) {
        const s = new Date(startAt).getTime();
        const e = new Date(endAt).getTime();
        if (!isFinite(s) || !isFinite(e) || s > e) {
          setError("Sluttiden måste vara efter starttiden.");
          setBusy(false);
          return;
        }
      }
      await editBayBooking(booking.id, {
        title, description,
        start_at: toISOStringFromLocal(startAt),
        end_at: toISOStringFromLocal(endAt),
      });
      if (onRefetch) await onRefetch();
      setRemountKey(k => k + 1);
      setEditMode(false);

      // NYTT: visa "Sparat" chip en kort stund
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte spara ändringarna.");
    } finally { setBusy(false); }
  };

  const handleStartNow = async () => {
    setBusy(true); setError(null);
    try {
      await setBookingStatus(booking.id, "in_progress");
      if (onRefetch) await onRefetch();
      setRemountKey(k => k + 1);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte uppdatera status.");
    } finally { setBusy(false); }
  };

  const handleDeleteConfirmed = async () => {
    setBusy(true); setError(null);
    try {
      await deleteBayBooking(booking.id);
      if (onRefetch) await onRefetch();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte ta bort bokningen.");
    } finally { setBusy(false); setDeleteAsk(false); }
  };

  const ui = (booking as any)._ui_info ?? {};
  const fallbackPhone =
    ui.customer_on_booking?.phone_e164 ||
    ui.customer_on_booking?.phone ||
    ui.car_primary_customer?.phone_e164 ||
    ui.car_primary_customer?.phone ||
    null;

  const handleMarkCompleted = async () => {
    const minutes =
      actualMinutesStr.trim() === ""
        ? defaultDurationMin
        : Math.max(0, Math.round(parseInt(actualMinutesStr, 10) || 0));

    const chargeMore = pricingChoice === "charge_time";
    const useCustom = pricingChoice === "custom_final";

    // Valideringar
    if (chargeMore) {
      if (!canChargeTime) {
        setError("Timdebitering är inte tillgänglig för denna bokning (service item saknar timpris eller är inte 'hourly').");
        return;
      }
      if (minutes <= 0) {
        setError("Ange ett antal minuter större än 0 för att debitera tid.");
        return;
      }
    }

    const customNet = useCustom ? customFinalOre : null;
    if (useCustom && (!customFinalValid || customNet == null)) {
      setError("Ogiltigt slutpris. Kontrollera beloppet och försök igen.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload = {
        actual_minutes_spent: minutes,
        charge_more_than_estimate: chargeMore && canChargeTime,
        use_custom_final_price: useCustom,
        custom_final_price_ore: customNet ?? null,
        phone_override_e164: fallbackPhone,
      };

      await completeBookingWithTime(booking.id, payload as any);

      // Uppdatera listan/kalendern och stäng modalen direkt (enkel och robust)
      if (onRefetch) await onRefetch();
      onClose();

      setRemountKey((k) => k + 1);
      setCompleteOpen(false);

      // Nollställ fält
      setActualMinutesStr("");
      setPricingChoice(null);
      setCustomFinalInput("");
      setCustomFinalOre(null);
      setCustomFinalValid(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte markera som klar.");
    } finally {
      setBusy(false);
    }
  };

  const minutesNumber =
    actualMinutesStr.trim() === ""
      ? defaultDurationMin
      : Math.max(0, Math.round(parseInt(actualMinutesStr, 10) || 0));

  const timeChargePreviewOre =
    canChargeTime && serviceItem?.hourly_rate_ore != null
      ? Math.round((minutesNumber / 60) * serviceItem.hourly_rate_ore)
      : null;

  const carLabel =
    ui.car?.label ||
    ((booking as any)?.car?.registration_number
      ? `${(booking as any).car.registration_number} • ${(booking as any).car.brand} (${(booking as any).car.model_year})`
      : null);

  const customerLabel =
    ui.customer_on_booking?.label ||
    ui.car_primary_customer?.label ||
    null;

  // 🔑 Tangentgenvägar
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && editMode && !isCompleted) {
      e.preventDefault(); handleSave();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isCompleted && completeOpen) {
      e.preventDefault(); handleMarkCompleted();
    }
  }, [editMode, isCompleted, completeOpen, startAt, endAt]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // --- UI ---
  const headerActions = (
    <div className={styles.headerActions}>
      {!isCompleted && (
        <button className={styles.iconBtn} onClick={() => setEditMode(v => !v)} aria-label="Redigera" title="Redigera (E)">
          <FaEdit />
        </button>
      )}
      {!isCompleted && (
        <button className={styles.iconBtn} onClick={handleStartNow} aria-label="Påbörja" title="Påbörja">
          <FaPlay />
        </button>
      )}
      {!isCompleted && (
        <button className={styles.iconBtn} onClick={() => setCompleteOpen(v => !v)} aria-label="Slutför" title="Slutför (⌘/Ctrl+Enter)">
          <FaCheckCircle />
        </button>
      )}
      <button className={styles.iconBtn} onClick={onClose} aria-label="Stäng" title="Stäng (Esc)"><FaTimes /></button>
    </div>
  );

  const modalUI = (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} // klick utanför → stäng
    >
      <div className={styles.modal} key={remountKey} role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
        {/* Header (fast) */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <h2 id="booking-modal-title">{title || `Bokning #${booking.id}`}</h2>
            <StatusChip status={booking.status} />
            {/* NYTT: “Sparat” chip visas kort efter lyckad save */}
            {justSaved && (
              <span className={`${styles.statusChip} ${styles["tone-completed"]}`} title="Ändringar sparade">
                <FaCheckCircle /> Sparat
              </span>
            )}
          </div>
          {headerActions}
        </div>

        {/* Scrollbart innehåll */}
        <div className={styles.content}>
          {/* Info-kort */}
          <SectionCard icon={<FaInfoCircle />} title="Information">
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <FaCalendarAlt />
                <span>
                  {new Date(booking.start_at).toLocaleString()} – {new Date(booking.end_at).toLocaleString()}
                </span>
              </div>
              {booking.assigned_user_id && (
                <div className={styles.metaItem}><FaUser /> <span>Mekaniker-ID: {booking.assigned_user_id}</span></div>
              )}
              {carLabel && (
                  <div
                    className={styles.metaItem}
                    data-regnr={(booking as any).car?.registration_number ?? ""}
                  >
                    <FaCarSide />
                    <span>{carLabel}</span>
                  </div>
                )}
              {customerLabel && (
                <div className={styles.metaItem}>
                  <FaUser />
                  <span>{customerLabel}</span>
                </div>
              )}

            </div>

            {/* Form / Read-only */}
            <div className={styles.formGrid}>
              <label className={styles.label}>
                Titel
                {editMode && !isCompleted ? (
                  <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
                ) : (
                  <div className={styles.readonlyField}>{title}</div>
                )}
              </label>

              <label className={styles.label}>
                Beskrivning
                {editMode && !isCompleted ? (
                  <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                ) : (
                  <div className={styles.readonlyField}>
                    {description ? description : <span className={styles.muted}>Ingen beskrivning</span>}
                  </div>
                )}
              </label>

              {editMode && !isCompleted && (
                <div className={styles.timeRow}>
                  <label className={`${styles.label} ${styles.timeField}`}>
                    Start
                    <input
                      type="datetime-local"
                      className={`${styles.input}`}
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                    />
                  </label>
                  <label className={`${styles.label} ${styles.timeField}`}>
                    Slut
                    <input
                      type="datetime-local"
                      className={`${styles.input}`}
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
                icon={<FaPlus />}
                title="Merförsäljning"
                right={
                  !isCompleted && (
                    <button
                      className={styles.upsellbtn}
                      onClick={() => setUpsellOpen(true)}
                      disabled={busy}
                      title="Skapa nytt erbjudande"
                    >
                      Skapa erbjudande
                    </button>
                  )
                }
              >
                {Boolean((booking as any).upsell_latest) ? (
                  <div className={styles.upsellLatest}>
                    <div className={styles.upsellLatestHeader}>Senaste</div>
                    <div className={styles.upsellItem}>
                      <div className={styles.upsellMain}>
                        <strong>{(booking as any).upsell_latest.title}</strong>
                        <UpsellChip status={(booking as any).upsell_latest.status} />
                      </div>
                      <div className={styles.upsellMeta}>
                        {(Math.round(((booking as any).upsell_latest.price_gross_ore ?? 0) / 100)).toLocaleString("sv-SE")} kr
                        {(booking as any).upsell_latest.sent_at && (
                          <span className={styles.dotSep}>
                            Skickad {new Date((booking as any).upsell_latest.sent_at).toLocaleString()}
                          </span>
                        )}
                        {(booking as any).upsell_latest.responded_at && (
                          <span className={styles.dotSep}>
                            Svar {new Date((booking as any).upsell_latest.responded_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.muted}>Inga merförsäljningar ännu.</div>
                )}

                {Array.isArray((booking as any).upsells_recent) && (booking as any).upsells_recent.length > 1 && (
                  <div className={styles.upsellList}>
                    <div className={styles.upsellListHeader}>Historik</div>
                    <ul>
                      {(booking as any).upsells_recent
                        .filter((u: Upsell) => u.id !== (booking as any).upsell_latest?.id) // undvik dubblett
                        .map((u: Upsell) => (
                          <li key={u.id} className={styles.upsellItem}>
                            <div className={styles.upsellMain}>
                              <span className={styles.upsellTitle}>{u.title}</span>
                              <UpsellChip status={u.status} />
                            </div>
                            <div className={styles.upsellMeta}>
                              {(Math.round((u.price_gross_ore ?? 0) / 100)).toLocaleString("sv-SE")} kr
                              {u.sent_at && <span className={styles.dotSep}>Skickad {new Date(u.sent_at).toLocaleString()}</span>}
                              {u.responded_at && <span className={styles.dotSep}>Svar {new Date(u.responded_at).toLocaleString()}</span>}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Din modal för att skapa nytt erbjudande */}
                {!isCompleted && upsellOpen && (
                  <UpsellModal
                    bookingId={booking.id}
                    onClose={() => setUpsellOpen(false)}
                    onSent={() => {
                      setUpsellOpen(false);
                      if (onRefetch) onRefetch();
                    }}
                  />
                )}
              </SectionCard>

          {/* Pris-kort */}
          <SectionCard
            icon={<FaCreditCard />}
            title="Pris"
            right={<span className={styles.vatBadge}>Moms {vatPercent ?? 25}%</span>}
          >
            <div className={styles.priceRow}>
              <div>
                <div className={styles.priceLabel}>Grundpris (inkl. moms)</div>
                <div className={styles.priceValue}>{formatCurrencySEK(baseGrossOre)}</div>
              </div>
              <div>
                <div className={styles.priceLabel}>Merförsäljning (godkänd)</div>
                <div className={styles.priceValue}>{formatCurrencySEK(upsellsAcceptedGrossOre)}</div>
              </div>
              <div>
                <div className={styles.priceLabel}>Totalt inkl. moms</div>
                <div className={styles.priceTotal}>{formatCurrencySEK(totalGrossOre)}</div>
              </div>
            </div>
          </SectionCard>


          {/* Slutför-kort */}
          {!isCompleted && (
            <SectionCard icon={<FaCheckCircle />} title="Slutför bokning">
              <div className={styles.completeGrid}>

                {/* Summering av priset */}
                <div className={styles.summaryBox}>
                  <div>Grundpris: {formatCurrencySEK(baseGrossOre)}</div>
                  <div>Merförsäljning: {formatCurrencySEK(upsellsAcceptedGrossOre)}</div>
                  <div className={styles.totalLine}>
                    Totalt: <strong>{formatCurrencySEK(totalGrossOre)}</strong>
                  </div>
                </div>

                {/* Tid */}
                <label className={styles.label}>
                  Tid som gick åt (minuter)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    placeholder={String(defaultDurationMin)}
                    value={actualMinutesStr}
                    onChange={(e) => setActualMinutesStr(e.target.value)}
                  />
                </label>

                {/* Val av prisstrategi */}
                <div className={styles.tileGrid}>
                  <RadioTile
                    name="pricingChoice"
                    value="keep_estimate"
                    checked={pricingChoice === "keep_estimate" || pricingChoice === null}
                    onChange={() => setPricingChoice("keep_estimate")}
                    title="Behåll uppskattat pris"
                    description={`Totalt inkl. moms: ${formatCurrencySEK(totalGrossOre)}`}
                    icon={<FaCreditCard />}
                  />
                  <RadioTile
                    name="pricingChoice"
                    value="charge_time"
                    checked={pricingChoice === "charge_time"}
                    onChange={() => setPricingChoice("charge_time")}
                    disabled={!canChargeTime}
                    title="Debitera tid × timpris"
                    description={
                      canChargeTime
                        ? `Timpris: ${(serviceItem?.hourly_rate_ore ?? 0) / 100} kr exkl. moms`
                        : "Inte tillgängligt"
                    }
                    icon={<FaClock />}
                  />
                  <RadioTile
                    name="pricingChoice"
                    value="custom_final"
                    checked={pricingChoice === "custom_final"}
                    onChange={() => setPricingChoice("custom_final")}
                    title="Ange slutpris (inkl. moms)"
                    icon={<FaEdit />}
                  />
                </div>

                {/* Extra fält för valda alternativ */}
                {pricingChoice === "charge_time" && (
                  <div className={styles.previewLine}>
                    Förhandsvisning tid: {formatCurrencySEK(timeChargePreviewOre)} exkl. moms
                  </div>
                )}

                 {pricingChoice === "custom_final" && (
                  <div className={styles.fieldGroup}>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="decimal"
                      placeholder="Slutpris inkl. moms"
                      value={customFinalInput}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomFinalInput(v);
                          const { ore, valid } = parsePriceToOre(v);
                          setCustomFinalOre(ore);
                          setCustomFinalValid(valid);
                        }}
                      />
                      <small className={styles.muted}>
                        Skriv heltal (kronor) eller med decimaler (komma eller punkt). Max 2 decimaler.
                      </small>

                      {customFinalInput && customFinalValid && customFinalOre != null && (
                        <small className={styles.muted}>
                          Sparas som <strong>{customFinalOre}</strong> öre (exkl. moms).
                        </small>
                      )}

                      {customFinalInput && !customFinalValid && (
                        <small className={styles.errorText}>Ogiltigt belopp.</small>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.completeActions}>
                  <button
                    className={styles.ghostBtn}
                    onClick={() => { setCompleteOpen(false); setActualMinutesStr(""); setPricingChoice(null); }}
                    disabled={busy}
                  >
                    Avbryt
                  </button>
                  <button className={styles.primaryBtn} onClick={handleMarkCompleted} disabled={busy}>
                    Slutför
                  </button>
                </div>
              </SectionCard>
             )}
          {error && <div className={styles.alertError}><FaInfoCircle /> {error}</div>}
        </div>

        {/* Knapprad (fast längst ner) */}
        <div className={styles.actions}>
          <div className={styles.leftActions}>
            {!isCompleted && (
              <>
                <button className={styles.ghostBtn} onClick={handleStartNow} disabled={busy}>
                  <FaClock className={styles.btnIcon} /> Påbörja
                </button>
                <button className={styles.warnBtn} onClick={() => setCompleteOpen(v => !v)} disabled={busy}>
                  <FaCheckCircle className={styles.btnIcon} /> Markera som klar
                </button>
              </>
            )}
          </div>

          <div className={styles.rightActions}>
            {!isCompleted && (!deleteAsk ? (
              <button className={styles.dangerBtn} onClick={() => setDeleteAsk(true)} disabled={busy}>
                <FaTrash className={styles.btnIcon} /> Ta bort
              </button>
            ) : (
              <div className={styles.confirmDelete}>
                <FaExclamationTriangle className={styles.warnIcon} />
                <span>Bekräfta borttagning?</span>
                <button className={styles.ghostBtn} onClick={() => setDeleteAsk(false)} disabled={busy}>Avbryt</button>
                <button className={styles.dangerBtn} onClick={handleDeleteConfirmed} disabled={busy}>Ta bort</button>
              </div>
            ))}

            <button className={styles.ghostBtn} onClick={onClose}><FaTimes className={styles.btnIcon} /> Stäng</button>

            {editMode && !isCompleted && (
              <button className={styles.primaryBtn} onClick={handleSave} disabled={busy}>
                <FaSave className={styles.btnIcon} /> {busy ? "Sparar…" : "Spara"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Rendera i <body> så modalen inte begränsas av föräldraoverflow
  return createPortal(modalUI, document.body);
};

export default BookingDetailsModal;
