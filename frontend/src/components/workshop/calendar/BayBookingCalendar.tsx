import React, { useEffect, useMemo, useState } from "react";
import { listBookings, updateBooking } from "@/services/baybookingService.ts";
import type { BayBookingRead, BookingStatus } from "@/services/baybookingService.ts";
import { fetchAllBays } from "@/services/servicebayService.ts";
import type { WorkshopBayReadSimple } from "@/services/servicebayService.ts";
import styles from "./css/BayBookingCalendar.module.css";
import BookingDetailsModal from "@/components/booking/BookingDetailsModal.tsx";
import { CiCircleInfo } from "react-icons/ci";
import MakeBooking from "@/components/booking/MakeBooking.tsx";
import Modal from "@/components/common/Modal.tsx";

// ---------- Props ----------
type Props = {
  workshopId: number;
  initialBayId?: number;
  startHour?: number; // default 7
  endHour?: number;   // default 18 (exkl)
};

// ---------- Datumhjälpare (mån–sön) ----------
const startOfWeekMonday = (d: Date) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // 0=mån
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};
const addDays = (d: Date, days: number) => {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
};
const toISO = (d: Date) => d.toISOString();
const formatDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const parseISO = (s: string) => new Date(s);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const badgeLabel: Record<BookingStatus, string> = {
  booked: "Bokad",
  in_progress: "Pågår",
  completed: "Klar",
  cancelled: "Avbokad",
  no_show: "Utebliven",
};

// ---------- Kedje-hjälpare ----------
type ChainKey = string; // "chain:<token>" eller "single:<id>"

const chainKeyFor = (b: BayBookingRead): ChainKey =>
  b.chain_token ? `chain:${b.chain_token}` : `single:${b.id}`;

const pickMaster = (parts: BayBookingRead[]) => {
  const priced = parts.find((p) => p.price_net_ore != null || p.price_gross_ore != null);
  if (priced) return priced;
  return parts.slice().sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime())[0];
};

type Merged = {
  key: ChainKey;
  master: BayBookingRead;
  parts: BayBookingRead[]; // tids-sorterade
  bay_id: number;
  title: string;
  status: BookingStatus;
};

// ---------- Komponent ----------
const BayBookingCalendar: React.FC<Props> = ({
  workshopId,
  initialBayId,
  startHour = 7,
  endHour = 18,
}) => {
  const [bays, setBays] = useState<WorkshopBayReadSimple[]>([]);
  const [selectedBayId, setSelectedBayId] = useState<number | undefined>(initialBayId);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [bookings, setBookings] = useState<BayBookingRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<BayBookingRead | null>(null);

  // Skapa-bokning via kalendern
  const [showMakeBooking, setShowMakeBooking] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);

  // Dra-urval
  const [isDragging, setIsDragging] = useState(false);
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragEndY, setDragEndY] = useState<number | null>(null);
  const [skipNextClick, setSkipNextClick] = useState(false);

  const isAnyModalOpen = !!activeBooking || showMakeBooking;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  // Ladda bays
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetchAllBays(workshopId);
        if (!active) return;
        setBays(res);
        if (!initialBayId && res.length > 0) {
          setSelectedBayId(res[0].id);
        } else if (initialBayId) {
          setSelectedBayId(initialBayId);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Kunde inte hämta servicebays.");
      }
    })();
    return () => {
      active = false;
    };
  }, [workshopId, initialBayId]);

  // Rensa ev. gamla localStorage-nycklar som kan påverka kalendern
  useEffect(() => {
    try {
      const keysToNuke = [
        "BayBookingCalendar:timezone",
        "BayBookingCalendar:selectedBay",
        "BayBookingCalendar:view",
        "BayBookingCalendar:weekStart",
      ];
      keysToNuke.forEach(k => localStorage.removeItem(k));
      const prefix = "BayBookingCalendar:";
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }, []);

  // Normalisera (säkerställer optional-fält)
  function normalizeBooking(b: BayBookingRead): BayBookingRead {
    return {
      ...b,
      customer: (b as any).customer ?? null,
      service_item: (b as any).service_item ?? {},
      car: (b as any).car ?? {},
      car_primary_customer: (b as any).car_primary_customer ?? {},
    } as BayBookingRead;
  }

  // Ladda om aktuell vecka (kan anropas efter ny bokning)
  const reloadWeek = async (bayId: number) => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(weekStart);
      const to = addDays(from, 7);
      const res = await listBookings({
        workshopId,
        bayId,
        dateFrom: toISO(from),
        dateTo: toISO(to),
        includeCancelled: false,
      });
      const normalized = (res ?? []).map(normalizeBooking);
      setBookings(normalized);
    } catch (e: any) {
      setError(e?.message ?? "Kunde inte hämta bokningar.");
    } finally {
      setLoading(false);
    }
  };

  // Ladda bookings för vald vecka & bay
  useEffect(() => {
    if (!selectedBayId) return;
    let active = true;
    (async () => {
      if (!active) return;
      await reloadWeek(selectedBayId);
    })();
    return () => {
      active = false;
    };
  }, [workshopId, selectedBayId, weekStart]);

  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(weekStart, i)), [weekStart]);

  // Layoutmått (synkas med CSS-variabler)
  const rowHeight = 56; // px per timme
  const totalMinutes = (endHour - startHour) * 60;
  const minutesSinceStart = (d: Date) => (d.getHours() - startHour) * 60 + d.getMinutes();

  // Sammanfoga kedjor men behåll luckor
  const mergedByDay = useMemo(() => {
    const byKey = new Map<ChainKey, BayBookingRead[]>();
    for (const b of bookings) {
      const key = chainKeyFor(b);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(b);
    }

    const merged: Merged[] = [];
    for (const [key, parts] of byKey.entries()) {
      const sorted = parts.slice().sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime());
      const master = pickMaster(sorted);
      merged.push({
        key,
        master,
        parts: sorted,
        bay_id: master.bay_id,
        title: master.title || "Bokning",
        status: master.status,
      });
    }

    type Segment = { topPx: number; heightPx: number; status: BookingStatus; start: Date; end: Date };
    type RenderItem = {
      key: ChainKey;
      dayIndex: number;
      bay_id: number;
      title: string;
      outerTopPx: number;
      outerHeightPx: number;
      segments: Segment[];
      master: BayBookingRead;
      tooltip: string;
    };

    const map: Record<number, RenderItem[]> = Object.fromEntries([...Array(7)].map((_, i) => [i, []]));

    days.forEach((day, dayIndex) => {
      const cellStart = new Date(day); cellStart.setHours(startHour, 0, 0, 0);
      const cellEnd = new Date(day);   cellEnd.setHours(endHour, 0, 0, 0);

      for (const m of merged) {
        const clippedParts: { start: Date; end: Date; status: BookingStatus }[] = [];
        for (const p of m.parts) {
          const ps = parseISO(p.start_at);
          const pe = parseISO(p.end_at);
          const s = new Date(Math.max(ps.getTime(), cellStart.getTime()));
          const e = new Date(Math.min(pe.getTime(), cellEnd.getTime()));
          if (e > s) clippedParts.push({ start: s, end: e, status: p.status });
        }
        if (clippedParts.length === 0) continue;

        const firstStart = clippedParts[0].start;
        const lastEnd = clippedParts[clippedParts.length - 1].end;

        const outerTopMin = minutesSinceStart(firstStart);
        const outerBottomMin = minutesSinceStart(lastEnd);
        if (outerBottomMin <= 0 || outerTopMin >= totalMinutes) continue;

        const outerVisibleTop = clamp(outerTopMin, 0, totalMinutes);
        const outerVisibleBottom = clamp(outerBottomMin, 0, totalMinutes);
        const outerHeightMin = Math.max(outerVisibleBottom - outerVisibleTop, 18);
        const outerTopPx = (outerVisibleTop / 60) * rowHeight;
        const outerHeightPx = (outerHeightMin / 60) * rowHeight;

        const segments: Segment[] = clippedParts.map((cp) => {
          const segTopMin = minutesSinceStart(cp.start) - outerVisibleTop;
          const segBottomMin = minutesSinceStart(cp.end) - outerVisibleTop;
          const segHeightMin = Math.max(segBottomMin - segTopMin, 6);
          return {
            topPx: (segTopMin / 60) * rowHeight,
            heightPx: (segHeightMin / 60) * rowHeight,
            status: cp.status,
            start: cp.start,
            end: cp.end,
          };
        });

        const tooltip = `${m.title} • ${formatTime(firstStart)}–${formatTime(lastEnd)}`;

        map[dayIndex].push({
          key: m.key,
          dayIndex,
          bay_id: m.bay_id,
          title: m.title,
          outerTopPx,
          outerHeightPx,
          segments,
          master: m.master,
          tooltip,
        });
      }
      map[dayIndex].sort((a, b) => a.outerTopPx - b.outerTopPx);
    });

    return map;
  }, [bookings, days, startHour, endHour, rowHeight, totalMinutes]);

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, [weekStart]);

  const mergedCount = useMemo(() => {
    const keys = new Set<string>(bookings.map(chainKeyFor));
    return keys.size;
  }, [bookings]);

  // === Modal-safe helpers ===
  const fullName = (c?: { first_name?: string | null; last_name?: string | null }) =>
    [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();

  const moneySEK = (ore?: number | null) =>
    ore == null ? "—" : (ore / 100).toLocaleString("sv-SE", { style: "currency", currency: "SEK" });

  const safeObj = <T extends object = any>(o: any): T => (o && typeof o === "object" ? o : ({} as T));

  const composeModalPayload = (master: BayBookingRead) => {
    const key = chainKeyFor(master);
    const parts = bookings
      .filter((b) => chainKeyFor(b) === key)
      .sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime());

    const car = (master as any).car;
    const onBooking = (master as any).customer;
    const primary = (master as any).car_primary_customer;
    const serviceItem = (master as any).service_item;

    const customerForModal = onBooking || primary || null;

    const _ui_info = {
      car: car
        ? {
            label: `${car.registration_number} • ${car.brand} (${car.model_year})`,
            ...safeObj(car),
          }
        : safeObj(null),
      customer_on_booking: onBooking
        ? {
            label: `${fullName(onBooking) || "Namnlös"}${onBooking.email ? ` • ${onBooking.email}` : ""}${onBooking.phone ? ` • ${onBooking.phone}` : ""}`,
            ...safeObj(onBooking),
          }
        : safeObj(null),
      car_primary_customer: primary
        ? {
            label: `${fullName(primary) || "Namnlös"}${primary.email ? ` • ${primary.email}` : ""}${primary.phone ? ` • ${primary.phone}` : ""}`,
            ...safeObj(primary),
          }
        : safeObj(null),
      price: {
        net_label: moneySEK(master.price_net_ore),
        gross_label: moneySEK(master.price_gross_ore),
        vat_percent: master.vat_percent ?? null,
        note: master.price_note ?? null,
        is_custom: master.price_is_custom ?? null,
        final_label: moneySEK(master.final_price_ore),
      },
      service_item: safeObj(serviceItem),
    };

    return {
      ...master,
      car: safeObj(car),
      customer: safeObj(customerForModal),
      car_primary_customer: safeObj(primary),
      service_item: safeObj(serviceItem),
      _ui_parts: parts,
      _ui_info,
    } as any;
  };

  // ====== Klick & drag till MakeBooking ======
  const roundTo = (minutes: number, step: number) => Math.floor(minutes / step) * step;

  const yToDateInDay = (yPx: number, day: Date) => {
    const minutesFromTop = (yPx / rowHeight) * 60;
    const m = clamp(roundTo(minutesFromTop, 15), 0, totalMinutes);
    const dt = new Date(day);
    dt.setHours(startHour, 0, 0, 0);
    dt.setMinutes(dt.getMinutes() + m);
    return dt;
  };

  const openMakeBookingAt = (colIdx: number, clientY: number, columnEl: HTMLDivElement | null) => {
    if (!selectedBayId || !columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    const y = clientY - rect.top;

    const baseDay = days[colIdx];
    const startMin = clamp(roundTo((y / rowHeight) * 60, 15), 0, totalMinutes - 15);

    const start = new Date(baseDay);
    start.setHours(startHour, 0, 0, 0);
    start.setMinutes(start.getMinutes() + startMin);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60); // snabb 60 min

    setDraftStart(start);
    setDraftEnd(end);
    setShowMakeBooking(true);
  };

  // === Nya skydd: starta drag ENDAST på tom yta ===
  const onDayMouseDown = (colIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (isAnyModalOpen) return;
    if (e.target !== e.currentTarget) return; // endast tom yta
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    e.preventDefault();
    setIsDragging(true);
    setDragColIdx(colIdx);
    setDragStartY(y);
    setDragEndY(y);
  };

  const onDayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isAnyModalOpen) return;
    if (!isDragging) return;
    if (e.target !== e.currentTarget) return; // ignorera när man hovrar över barn
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDragEndY(y);
  };

  const onDayMouseUp = (colIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (isAnyModalOpen) return;
    if (!isDragging || dragColIdx == null) return;
    if (e.target !== e.currentTarget) {
      // Släpp på ett barn: avbryt drag-skapande
      setIsDragging(false);
      setDragColIdx(null);
      setDragStartY(null);
      setDragEndY(null);
      return;
    }

    setIsDragging(false);

    const day = days[dragColIdx];
    const startY = Math.min(dragStartY ?? 0, dragEndY ?? 0);
    const endY = Math.max(dragStartY ?? 0, dragEndY ?? 0);

    const startDt = yToDateInDay(startY, day);
    const endDtRaw = yToDateInDay(endY, day);
    const endDt = new Date(Math.max(endDtRaw.getTime(), startDt.getTime() + 30 * 60 * 1000)); // minst 30 min

    setDraftStart(startDt);
    setDraftEnd(endDt);
    setShowMakeBooking(true);

    setSkipNextClick(true); // ät upp click som följer efter drag

    // reset
    setDragColIdx(null);
    setDragStartY(null);
    setDragEndY(null);
  };

  const onDayMouseLeave = () => {
    if (isAnyModalOpen) return;
    if (isDragging) {
      setIsDragging(false);
      setDragColIdx(null);
      setDragStartY(null);
      setDragEndY(null);
    }
  };

  return (
    <div
      className={styles.wrapper}
      style={
        {
          ["--timeColWidth" as any]: `64px`,
          ["--dayHeaderH" as any]: `44px`,
          ["--rowH" as any]: `${56}px`,
        } as React.CSSProperties
      }
    >
      {/* Topbar / kontroller */}
      <div className={styles.topbar}>
        <div className={styles.title}>Veckoschema (Mån–Sön)</div>
        <div className={styles.controls}>
          <label className={styles.selectLabel}>Arbetsplats</label>
          <select
            className={styles.select}
            value={selectedBayId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedBayId(v === "" ? undefined : Number(v));
            }}
          >
            <option value="">{bays.length ? "Välj arbetsplats…" : "Hämtar…"}</option>
            {bays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Föregående
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
            Idag
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Nästa →
          </button>
        </div>
      </div>

      {/* Veckoheader */}
      <div className={styles.headerGrid}>
        <div className={styles.headerTimeCol} />
        {days.map((d, i) => {
          const isToday = new Date().toDateString() === d.toDateString();
          return (
            <div key={i} className={`${styles.headerDay} ${isToday ? styles.isToday : ""}`} title={d.toDateString()}>
              {formatDayLabel(d)} {isToday ? "•" : ""}
            </div>
          );
        })}
      </div>

      {/* Grid + innehåll */}
      <div className={styles.scrollArea}>
        <div className={styles.grid}>
          {/* Tid-kolumn */}
          <div className={styles.timeCol}>
            {hours.map((h) => (
              <div key={h} className={styles.hourCell}>
                {`${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Dagkolumner */}
          {days.map((_, colIdx) => (
            <div key={colIdx} className={styles.dayCol}>
              {hours.map((h) => (
                <div key={h} className={styles.hourCellBg} />
              ))}
            </div>
          ))}

          {/* Bokningslager – kedjevis med del-segment */}
          <div className={styles.overlayGrid}>
            <div /> {/* tom tidskolumn i overlay */}
            {days.map((day, colIdx) => {
              const items = mergedByDay[colIdx] ?? [];
              return (
                <div
                  key={colIdx}
                  className={styles.overlayDay}
                  style={isAnyModalOpen ? { pointerEvents: "none" } : undefined}
                  onMouseDown={(e) => onDayMouseDown(colIdx, e)}
                  onMouseMove={onDayMouseMove}
                  onMouseUp={(e) => onDayMouseUp(colIdx, e)}
                  onMouseLeave={onDayMouseLeave}
                  onClick={(e) => {
                    if (isAnyModalOpen) return;
                    if (skipNextClick) {
                      setSkipNextClick(false);
                      return;
                    }
                    if (isDragging) return;
                    if (e.target !== e.currentTarget) return; // endast tom yta
                    openMakeBookingAt(colIdx, e.clientY, e.currentTarget as HTMLDivElement);
                  }}
                  title="Dra för att markera intervall, eller klicka för snabb tid"
                >
                  {/* Drag-visualisering */}
                  {isDragging && dragColIdx === colIdx && dragStartY != null && dragEndY != null && (
                    <div
                      className={styles.dragSelection}
                      style={{
                        top: Math.min(dragStartY, dragEndY),
                        height: Math.abs(dragEndY - dragStartY),
                      }}
                    />
                  )}

                  {items.map((it, idx) => {
                    const startBound = new Date(
                      day.getFullYear(),
                      day.getMonth(),
                      day.getDate(),
                      startHour, 0, 0
                    );
                    const endBound = new Date(
                      day.getFullYear(),
                      day.getMonth(),
                      day.getDate(),
                      endHour, 0, 0
                    );
                    return (
                      <div
                        key={`${it.key}-${colIdx}-${idx}`}
                        className={`${styles.booking} ${styles.bookingChainBg}`}
                        style={{ top: it.outerTopPx, height: it.outerHeightPx, left: `${idx * 6}px` }}
                        title={it.tooltip}
                        // Viktigt: stoppa *även* mousedown – annars initieras parentens drag
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation(); // blockera overlay-klick
                          setActiveBooking(composeModalPayload(it.master) as any);
                        }}
                      >
                        {/* Huvudrad */}
                        <div className={styles.bookingHead}>
                          <button
                            className={styles.infoBtn}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveBooking(composeModalPayload(it.master) as any);
                            }}
                            title="Visa mer"
                          >
                            <CiCircleInfo />
                          </button>
                          <div className={styles.bookingTitle}>{it.title}</div>
                          <span className={styles.badge}>{badgeLabel[it.master.status]}</span>
                        </div>

                        {/* Inre segment */}
                        {it.segments.map((seg, i) => (
                          <div
                            key={i}
                            className={`${styles.bookingSegment} ${styles[`status-${it.master.status}`]}`}
                            style={{ top: seg.topPx, height: seg.heightPx }}
                            title={`${formatTime(seg.start)}–${formatTime(seg.end)}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveBooking(composeModalPayload(it.master) as any);
                            }}
                          />
                        ))}

                        {/* Meta-rad */}
                        <div className={styles.bookingMeta}>
                          {formatTime(startBound <= it.segments[0].start ? it.segments[0].start : startBound)}
                          –
                          {formatTime(endBound >= it.segments[it.segments.length - 1].end ? it.segments[it.segments.length - 1].end : endBound)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footerstatus */}
      <div className={styles.footer}>
        <strong className={styles.footerStrong}>{weekLabel}</strong>
        {selectedBayId && (
          <span>
            Bay:&nbsp;
            <strong className={styles.footerStrong}>
              {bays.find((b) => b.id === selectedBayId)?.name ?? "—"}
            </strong>
          </span>
        )}
        <span className={styles.footerRight}>
          {loading ? "Laddar bokningar…" : error ? `Fel: ${error}` : `${mergedCount} bokning(ar)`}
        </span>
      </div>

      {/* Booking-details modal */}
      {activeBooking && (
        <BookingDetailsModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onSave={async (updated) => {
            const saved = await updateBooking((activeBooking as BayBookingRead).id, updated);
            const normSaved = normalizeBooking(saved);
            setBookings((prev) => prev.map((bk) => (bk.id === normSaved.id ? { ...bk, ...normSaved } : bk)));
            setActiveBooking(composeModalPayload(normSaved) as any);
          }}
        />
      )}

      {/* MakeBooking-modal (skapa ny bokning via kalendervyn) */}
      {showMakeBooking && draftStart && draftEnd && selectedBayId && (
        <Modal
          title="Ny bokning"
          open={showMakeBooking}
          onClose={() => {
            setShowMakeBooking(false);
            setDraftStart(null);
            setDraftEnd(null);
          }}
        >
          <MakeBooking
              workshopId={workshopId}
              defaultBayId={selectedBayId!}
              defaultStartAt={draftStart!}
              defaultEndAt={draftEnd!}
              onCreated={async (_created) => {
                setShowMakeBooking(false);
                setDraftStart(null);
                setDraftEnd(null);
                await reloadWeek(selectedBayId!);
              }}
              onClose={() => {
                setShowMakeBooking(false);
                setDraftStart(null);
                setDraftEnd(null);
              }}
            />
        </Modal>
      )}
    </div>
  );
};

export default BayBookingCalendar;
