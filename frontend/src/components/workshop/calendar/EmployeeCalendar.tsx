import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./css/EmployeeCalendar.module.css";

import BookingDetailsModal from "@/components/booking/BookingDetailsModal";
import { CiCircleInfo } from "react-icons/ci";

import { updateBooking } from "@/services/baybookingService";
import type { BayBookingRead, BookingStatus, BayBookingUpdate } from "@/services/baybookingService";

import {
  listWorkingHours,
  listTimeOff,
  type UserWorkingHours,
  type UserTimeOff,
  type TimeOffType,
} from "@/services/userService";

/** ======= Props ======= */
type Props = {
  /** Vilken användare kalendern ska visa (KRÄVS för korrekt laddning) */
  userId: number;

  /** Vilken verkstad visas i footer/kontext (frivilligt, påverkar inte laddning av schemat) */
  workshopId?: number;

  /** Namn som visas i topbar (om du vill slippa extra fetch av användare) */
  employeeName?: string;

  /** Start-/sluttimme i kalendern (standard 07–18 exklusive endHour) */
  startHour?: number; // default 7
  endHour?: number; // default 18 (exkl)

  /**
   * Valfri loader för bokningar kopplade till en anställd.
   * Om den inte tillhandahålls så renderas endast arbetstid & frånvaro.
   * Ska returnera bokningar som överlappar [from, to).
   */
  loadBookingsForUser?: (
    userId: number,
    fromISO: string,
    toISO: string
  ) => Promise<BayBookingRead[]>;

  /**
   * Om true → tillåt drag/resize + spara (admin-läge).
   * Lämna tomt/false för anställda → de kan INTE ändra tider.
   */
  editable?: boolean;
};

/** ======= Hjälpare datum (mån–sön) ======= */
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
const parseISO = (s: string) => new Date(s);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const formatDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** ======= UI labels ======= */
const badgeLabel: Record<BookingStatus, string> = {
  booked: "Bokad",
  in_progress: "Pågår",
  completed: "Klar",
  cancelled: "Avbokad",
  no_show: "Utebliven",
};
const timeOffLabel: Record<TimeOffType, string> = {
  vacation: "Semester",
  sick: "Sjukfrånv.",
  training: "Utbildning",
  other: "Frånvaro",
};

/** ======= Drag & drop konstanter ======= */
const SNAP_MIN = 15;
const RESIZE_MARGIN_PX = 8;

type DragMode = "move" | "resize-start" | "resize-end" | null;

type DragState = {
  mode: DragMode;
  bookingId: number;
  originClientX: number;
  originClientY: number;
  originDayIndex: number;
  originStart: Date;
  originEnd: Date;
  previewStart: Date;
  previewEnd: Date;
};

/** Hjälpare: index (0..6) för ett datum inom given veckas start */
const dayIndexInWeek = (weekStart: Date, date: Date) => {
  const ms = Math.floor((date.getTime() - weekStart.getTime()) / 86400000);
  return clamp(ms, 0, 6);
};

/** ======= Komponent ======= */
const EmployeeCalendar: React.FC<Props> = ({
  userId,
  workshopId,
  employeeName,
  startHour = 7,
  endHour = 18,
  loadBookingsForUser,
  editable = false,
}) => {
  /** UI state */
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Mobil: endast dagsvy */
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const [mobileDayIndex, setMobileDayIndex] = useState<number>(() =>
    dayIndexInWeek(startOfWeekMonday(new Date()), new Date())
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", handler);
    handler();
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  /** Data */
  const [workingHours, setWorkingHours] = useState<UserWorkingHours[]>([]);
  const [timeOff, setTimeOff] = useState<UserTimeOff[]>([]);
  const [bookings, setBookings] = useState<BayBookingRead[]>([]);

  /** Modal (bokning, om vi har sådana) */
  const [activeBooking, setActiveBooking] = useState<BayBookingRead | null>(null);

  /** Layout */
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const rowHeight = 56; // px per timme (matchar CSS var)
  const totalMinutes = (endHour - startHour) * 60;
  const minutesSinceStart = (d: Date) => (d.getHours() - startHour) * 60 + d.getMinutes();

  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(weekStart, i)), [weekStart]);
  const visibleDayIdxs = isMobile ? [mobileDayIndex] : [0, 1, 2, 3, 4, 5, 6];

  const weekLabel = useMemo(() => {
    if (isMobile) {
      const d = days[mobileDayIndex];
      return d.toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    const end = addDays(weekStart, 6);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, [weekStart, isMobile, mobileDayIndex, days]);

  /** Overlay kolumnrefs för DnD */
  const dayColsRef = useRef<(HTMLDivElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);

  /** ======= Ladda arbetstider + frånvaro + (ev) bokningar ======= */
  useEffect(() => {
    if (typeof userId !== "number") return;
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [wh, to] = await Promise.all([listWorkingHours(userId), listTimeOff(userId)]);
        if (!active) return;
        setWorkingHours(wh ?? []);
        setTimeOff(to ?? []);

        if (loadBookingsForUser) {
          const from = new Date(weekStart);
          const toDate = addDays(from, 7);
          const result = await loadBookingsForUser(userId, toISO(from), toISO(toDate));
          if (!active) return;
          setBookings((result ?? []).map(normalizeBooking));
        } else {
          setBookings([]);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Kunde inte hämta schema.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, weekStart, loadBookingsForUser]);

  /** Normalisera (samma försiktighet som i Bay-kalendern) */
  function normalizeBooking(b: BayBookingRead): BayBookingRead {
    return {
      ...b,
      customer: (b as any).customer ?? null,
      service_item: (b as any).service_item ?? {},
      car: (b as any).car ?? {},
      car_primary_customer: (b as any).car_primary_customer ?? {},
    } as BayBookingRead;
  }

  /** ======= Render-modeller ======= */
  type WHSegment = { dayIndex: number; start: Date; end: Date; topPx: number; heightPx: number };
  const whSegments: WHSegment[] = useMemo(() => {
    const segs: WHSegment[] = [];
    for (let i = 0; i < 7; i++) {
      const day = days[i];
      const ymd = day.toISOString().slice(0, 10);
      const weekday = i;

      const matches = (workingHours ?? []).filter((wh) => {
        if (wh.weekday !== weekday) return false;
        const fromOk = !wh.valid_from || ymd >= wh.valid_from;
        const toOk = !wh.valid_to || ymd <= wh.valid_to;
        return fromOk && toOk;
      });

      for (const wh of matches) {
        const [sh, sm] = wh.start_time.split(":").map(Number);
        const [eh, em] = wh.end_time.split(":").map(Number);

        const s = new Date(day);
        s.setHours(sh, sm, 0, 0);
        const e = new Date(day);
        e.setHours(eh, em, 0, 0);

        const cellStart = new Date(day);
        cellStart.setHours(startHour, 0, 0, 0);
        const cellEnd = new Date(day);
        cellEnd.setHours(endHour, 0, 0, 0);

        const start = new Date(Math.max(s.getTime(), cellStart.getTime()));
        const end = new Date(Math.min(e.getTime(), cellEnd.getTime()));
        if (end <= start) continue;

        const topMin = clamp(minutesSinceStart(start), 0, totalMinutes);
        const bottomMin = clamp(minutesSinceStart(end), 0, totalMinutes);
        const heightMin = Math.max(bottomMin - topMin, 12);

        segs.push({
          dayIndex: i,
          start,
          end,
          topPx: (topMin / 60) * rowHeight,
          heightPx: (heightMin / 60) * rowHeight,
        });
      }
    }
    return segs;
  }, [workingHours, days, startHour, endHour]);

  type TOFSegment = {
    dayIndex: number;
    start: Date;
    end: Date;
    topPx: number;
    heightPx: number;
    type: TimeOffType;
    reason?: string | null;
  };
  const toSegments: TOFSegment[] = useMemo(() => {
    const segs: TOFSegment[] = [];
    for (let i = 0; i < 7; i++) {
      const day = days[i];
      const cellStart = new Date(day);
      cellStart.setHours(startHour, 0, 0, 0);
      const cellEnd = new Date(day);
      cellEnd.setHours(endHour, 0, 0, 0);

      for (const t of timeOff ?? []) {
        const s = parseISO(t.start_at);
        const e = parseISO(t.end_at);

        const sClip = new Date(Math.max(s.getTime(), cellStart.getTime()));
        const eClip = new Date(Math.min(e.getTime(), cellEnd.getTime()));
        if (eClip <= sClip) continue;

        const topMin = clamp(minutesSinceStart(sClip), 0, totalMinutes);
        const bottomMin = clamp(minutesSinceStart(eClip), 0, totalMinutes);
        const heightMin = Math.max(bottomMin - topMin, 6);

        segs.push({
          dayIndex: i,
          start: sClip,
          end: eClip,
          type: t.type ?? "other",
          reason: t.reason ?? null,
          topPx: (topMin / 60) * rowHeight,
          heightPx: (heightMin / 60) * rowHeight,
        });
      }
    }
    return segs;
  }, [timeOff, days, startHour, endHour]);

  type BookingRender = {
    booking: BayBookingRead;
    dayIndex: number;
    topPx: number;
    heightPx: number;
    title: string;
  };
  const bookingItems: BookingRender[] = useMemo(() => {
    if (!bookings?.length) return [];
    const items: BookingRender[] = [];
    for (let i = 0; i < 7; i++) {
      const day = days[i];
      const cellStart = new Date(day);
      cellStart.setHours(startHour, 0, 0, 0);
      const cellEnd = new Date(day);
      cellEnd.setHours(endHour, 0, 0, 0);

      for (const b of bookings) {
        const s = parseISO(b.start_at);
        const e = parseISO(b.end_at);

        const sClip = new Date(Math.max(s.getTime(), cellStart.getTime()));
        const eClip = new Date(Math.min(e.getTime(), cellEnd.getTime()));
        if (eClip <= sClip) continue;

        const topMin = clamp(minutesSinceStart(sClip), 0, totalMinutes);
        const bottomMin = clamp(minutesSinceStart(eClip), 0, totalMinutes);
        const heightMin = Math.max(bottomMin - topMin, 18);

        items.push({
          booking: b,
          dayIndex: i,
          topPx: (topMin / 60) * rowHeight,
          heightPx: (heightMin / 60) * rowHeight,
          title: b.title || "Bokning",
        });
      }
    }
    return items.sort((a, b) => a.dayIndex - b.dayIndex || a.topPx - b.topPx);
  }, [bookings, days, startHour, endHour]);

  // === Modal-safe helpers (behåll dessa eller lägg nära funktionen) ===
    const fullName = (c?: { first_name?: string | null; last_name?: string | null }) =>
      [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();

    const moneySEK = (ore?: number | null) =>
      ore == null ? "—" : (ore / 100).toLocaleString("sv-SE", { style: "currency", currency: "SEK" });

    const safeObj = <T extends object = any>(o: any): T =>
      o && typeof o === "object" ? o : ({} as T);

    // === NY: samma payload som i BayBookingCalendar ===
    const composeModalPayload = (master: BayBookingRead) => {
      const car = (master as any).car;
      const onBooking = (master as any).customer;
      const primary = (master as any).car_primary_customer;
      const serviceItem = (master as any).service_item;

      // exakt samma fallbacklogik: kund på bokningen först, annars bilens primärkund
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
        _ui_parts: [master], // i Bay skickar vi alla delar; här räcker master
        _ui_info,
      } as any;
    };


  /** ======= Drag & Drop logik ======= */
  const [drag, setDrag] = useState<DragState | null>(null);
  const canEdit = !!editable;

  const pxToMinutesClamped = (px: number) => {
    const mins = (px / rowHeight) * 60;
    const snapped = Math.round(mins / SNAP_MIN) * SNAP_MIN;
    return clamp(snapped, 0, totalMinutes);
  };

  const getDayIndexFromClientX = (clientX: number): number => {
    const nodes = dayColsRef.current;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
    }
    return drag?.originDayIndex ?? 0;
  };

  const getColumnRect = (dayIndex: number): DOMRect | null => {
    const n = dayColsRef.current[dayIndex];
    return n ? n.getBoundingClientRect() : null;
  };

  const handleBookingMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    it: BookingRender
  ) => {
    if (!canEdit) return; // 🔒 anställd kan inte initiera DnD
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    const mode: DragMode =
      offsetY <= RESIZE_MARGIN_PX ? "resize-start" :
      offsetY >= rect.height - RESIZE_MARGIN_PX ? "resize-end" :
      "move";

    setDrag({
      mode,
      bookingId: it.booking.id,
      originClientX: e.clientX,
      originClientY: e.clientY,
      originDayIndex: it.dayIndex,
      originStart: new Date(it.booking.start_at),
      originEnd: new Date(it.booking.end_at),
      previewStart: new Date(it.booking.start_at),
      previewEnd: new Date(it.booking.end_at),
    });

    e.preventDefault();
  };

  useEffect(() => {
    if (!drag || !canEdit) return;

    const onMove = (ev: MouseEvent) => {
      const dayIdx = getDayIndexFromClientX(ev.clientX);
      const colRect = getColumnRect(dayIdx);
      if (!colRect) return;

      const y = clamp(ev.clientY - colRect.top, 0, colRect.height);
      const minsFromTop = pxToMinutesClamped(y);
      const day = days[dayIdx];
      const baseDayStart = new Date(day);
      baseDayStart.setHours(startHour, 0, 0, 0);

      const minutesToDate = (min: number) => {
        const dt = new Date(baseDayStart);
        dt.setMinutes(dt.getMinutes() + min);
        return dt;
      };

      if (drag.mode === "move") {
        const durationMin = (drag.originEnd.getTime() - drag.originStart.getTime()) / 60000;
        const maxStartMin = totalMinutes - durationMin;
        const startMinClamped = clamp(minsFromTop, 0, Math.max(0, maxStartMin));
        const newStart = minutesToDate(startMinClamped);
        const newEnd = minutesToDate(startMinClamped + durationMin);
        setDrag((d) => d ? { ...d, previewStart: newStart, previewEnd: newEnd, originDayIndex: dayIdx } : d);
      } else if (drag.mode === "resize-start") {
        const endLocal = new Date(drag.previewEnd);
        let newStart = minutesToDate(Math.min(minsFromTop, totalMinutes - SNAP_MIN));
        if (newStart >= endLocal) newStart = new Date(endLocal.getTime() - SNAP_MIN * 60000);
        setDrag((d) => d ? { ...d, previewStart: newStart, originDayIndex: dayIdx } : d);
      } else if (drag.mode === "resize-end") {
        const startLocal = new Date(drag.previewStart);
        let newEnd = minutesToDate(Math.max(minsFromTop, SNAP_MIN));
        if (newEnd <= startLocal) newEnd = new Date(startLocal.getTime() + SNAP_MIN * 60000);
        setDrag((d) => d ? { ...d, previewEnd: newEnd, originDayIndex: dayIdx } : d);
      }
    };

    const onUp = async () => {
      // Endast om tider ändrats och vi får editera → spara
      const b = bookings.find((x) => x.id === drag.bookingId);
      if (b) {
        const newStart = drag.previewStart;
        const newEnd = drag.previewEnd;
        const changed =
          new Date(b.start_at).getTime() !== newStart.getTime() ||
          new Date(b.end_at).getTime() !== newEnd.getTime();

        if (changed && canEdit) {
          try {
            const payload: BayBookingUpdate = {
              start_at: newStart.toISOString(),
              end_at: newEnd.toISOString(),
            };
            const saved = await updateBooking(b.id, payload as any);
            const normalized = normalizeBooking(saved);
            setBookings((prev) => prev.map((bk) => (bk.id === b.id ? { ...bk, ...normalized } : bk)));
          } catch (e: any) {
            setError(e?.message ?? "Kunde inte uppdatera bokning.");
          }
        }
      }
      setDrag(null);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });

    document.body.style.cursor =
      drag.mode === "move" ? "move" : (drag.mode ? "ns-resize" : "");

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp as any);
      document.body.style.cursor = "";
    };
  }, [drag, bookings, days, endHour, startHour, totalMinutes, canEdit]);

  /** ======= Navigering (mobile = dag, desktop = vecka) ======= */
  const gotoToday = () => {
    const today = new Date();
    const ws = startOfWeekMonday(today);
    setWeekStart(ws);
    setMobileDayIndex(dayIndexInWeek(ws, today));
  };
  const prev = () => {
    if (isMobile) {
      const curr = days[mobileDayIndex];
      const d = addDays(curr, -1);
      const ws = startOfWeekMonday(d);
      setWeekStart(ws);
      setMobileDayIndex(dayIndexInWeek(ws, d));
    } else {
      setWeekStart(addDays(weekStart, -7));
    }
  };
  const next = () => {
    if (isMobile) {
      const curr = days[mobileDayIndex];
      const d = addDays(curr, +1);
      const ws = startOfWeekMonday(d);
      setWeekStart(ws);
      setMobileDayIndex(dayIndexInWeek(ws, d));
    } else {
      setWeekStart(addDays(weekStart, +7));
    }
  };

  /** ======= Render ======= */
  return (
    <div
      className={`${styles.wrapper} ${styles.fill}`}
      style={
        {
          ["--timeColWidth" as any]: "64px",
          ["--dayHeaderH" as any]: "44px",
          ["--rowH" as any]: `${rowHeight}px`,
          ["--days" as any]: isMobile ? 1 : 7,
        } as React.CSSProperties
      }
    >
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.title}>
          {employeeName ? `Schema: ${employeeName}` : `Schema (ID ${userId})`}
        </div>
        <div className={styles.controls}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={prev}>
            ← Föregående
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={gotoToday}>
            Idag
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>
            Nästa →
          </button>
        </div>
      </div>

      {/* Vecko-/dagsheader */}
      <div className={styles.headerGrid}>
        <div className={styles.headerTimeCol} />
        {visibleDayIdxs.map((idx) => {
          const d = days[idx];
          const isToday = new Date().toDateString() === d.toDateString();
          return (
            <div
              key={idx}
              className={`${styles.headerDay} ${isToday ? styles.isToday : ""}`}
              title={d.toDateString()}
            >
              {formatDayLabel(d)} {isToday ? "•" : ""}
            </div>
          );
        })}
      </div>

      {/* Grid + innehåll */}
      <div className={styles.scrollArea}>
        <div className={styles.grid} ref={gridRef}>
          {/* Tid-kolumn */}
          <div className={styles.timeCol}>
            {hours.map((h) => (
              <div key={h} className={styles.hourCell}>
                {`${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Dagkolumner (bakgrundslinjer) */}
          {visibleDayIdxs.map((idx, visIdx) => (
            <div
              key={idx}
              className={styles.dayCol}
              ref={(el) => (dayColsRef.current[visIdx] = el)} /* ref per synlig kolumn */
            >
              {hours.map((h) => (
                <div key={h} className={styles.hourCellBg} />
              ))}
            </div>
          ))}

          {/* Overlay-lager */}
          <div className={styles.overlayGrid}>
            <div /> {/* tom tidskolumn */}
            {visibleDayIdxs.map((dayIndex) => {
              const day = days[dayIndex];
              const wh = whSegments.filter((s) => s.dayIndex === dayIndex);
              const tf = toSegments.filter((s) => s.dayIndex === dayIndex);
              const bks = bookingItems.filter((b) => b.dayIndex === dayIndex);

              const startBound = new Date(
                day.getFullYear(),
                day.getMonth(),
                day.getDate(),
                startHour,
                0,
                0
              );
              const endBound = new Date(
                day.getFullYear(),
                day.getMonth(),
                day.getDate(),
                endHour,
                0,
                0
              );

              return (
                <div key={dayIndex} className={styles.overlayDay}>
                  {/* Arbetstid-block */}
                  {wh.map((s, i) => (
                    <div
                      key={`wh-${dayIndex}-${i}`}
                      className={styles.workingBlock}
                      style={{ top: s.topPx, height: s.heightPx }}
                      title={`Arbetstid • ${formatTime(s.start)}–${formatTime(s.end)}`}
                    />
                  ))}

                  {/* Frånvaro */}
                  {tf.map((s, i) => (
                    <div
                      key={`to-${dayIndex}-${i}`}
                      className={`${styles.timeOffBlock} ${styles[`timeoff-${s.type}`]}`}
                      style={{ top: s.topPx, height: s.heightPx }}
                      title={`${timeOffLabel[s.type]} • ${formatTime(s.start)}–${formatTime(s.end)}${s.reason ? ` • ${s.reason}` : ""}`}
                    >
                      <div className={styles.timeOffInner}>
                        <span className={styles.timeOffBadge}>{timeOffLabel[s.type]}</span>
                        <span className={styles.timeOffTime}>
                          {formatTime(s.start)}–{formatTime(s.end)}
                        </span>
                        {s.reason ? <span className={styles.timeOffReason}>• {s.reason}</span> : null}
                      </div>
                    </div>
                  ))}

                  {/* Bokningar */}
                  {bks.map((it, idx) => {
                    const cls = `${styles.booking} ${styles[`status-${it.booking.status}`]}`;
                    return (
                      <div
                        key={`bk-${dayIndex}-${idx}`}
                        className={cls}
                        style={{
                          top: it.topPx,
                          height: it.heightPx,
                          left: `${idx * 6}px`,
                          cursor: canEdit ? "grab" : "pointer",
                        }}
                        title={`${it.title} • ${formatTime(
                          new Date(Math.max(parseISO(it.booking.start_at).getTime(), startBound.getTime()))
                        )}–${formatTime(
                          new Date(Math.min(parseISO(it.booking.end_at).getTime(), endBound.getTime()))
                        )}`}
                        onMouseDown={(e) => handleBookingMouseDown(e, it)}     // gör inget om !canEdit
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveBooking(composeModalPayload(it.booking) as any);
                        }}
                      >
                        <div className={styles.bookingHead}>
                          <button
                            className={styles.infoBtn}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveBooking(composeModalPayload(it.booking) as any);
                            }}
                            title="Visa mer"
                          >
                            <CiCircleInfo />
                          </button>
                          <div className={styles.bookingTitle}>{it.title}</div>
                          <span className={styles.badge}>{badgeLabel[it.booking.status]}</span>
                        </div>
                        <div className={styles.bookingMeta}>
                          {formatTime(new Date(Math.max(parseISO(it.booking.start_at).getTime(), startBound.getTime())))} –{" "}
                          {formatTime(new Date(Math.min(parseISO(it.booking.end_at).getTime(), endBound.getTime())))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Drag-preview (endast om edit tillåten) */}
                  {canEdit && drag && drag.originDayIndex === dayIndex && (() => {
                    const start = drag.previewStart;
                    const end = drag.previewEnd;
                    const inThisDay =
                      start.toDateString() === day.toDateString() ||
                      end.toDateString() === day.toDateString();
                    if (!inThisDay) return null;

                    const cellStart = new Date(day);
                    cellStart.setHours(startHour, 0, 0, 0);
                    const cellEnd = new Date(day);
                    cellEnd.setHours(endHour, 0, 0, 0);

                    const sClip = new Date(Math.max(start.getTime(), cellStart.getTime()));
                    const eClip = new Date(Math.min(end.getTime(), cellEnd.getTime()));
                    if (eClip <= sClip) return null;

                    const topMin = clamp(minutesSinceStart(sClip), 0, totalMinutes);
                    const bottomMin = clamp(minutesSinceStart(eClip), 0, totalMinutes);
                    const heightMin = Math.max(bottomMin - topMin, 6);

                    const topPx = (topMin / 60) * rowHeight;
                    const heightPx = (heightMin / 60) * rowHeight;

                    return (
                      <div
                        className={`${styles.booking}`}
                        style={{
                          top: topPx,
                          height: heightPx,
                          left: "0px",
                          right: "0px",
                          opacity: 0.6,
                          pointerEvents: "none",
                          borderStyle: "dashed",
                        }}
                      >
                        <div className={styles.bookingHead}>
                          <div className={styles.bookingTitle}>
                            {drag.mode === "move" ? "Flytta" : drag.mode === "resize-start" ? "Ändra start" : "Ändra slut"}
                          </div>
                        </div>
                        <div className={styles.bookingMeta}>
                          {formatTime(sClip)} – {formatTime(eClip)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <strong className={styles.footerStrong}>{weekLabel}</strong>
        {typeof workshopId !== "undefined" && (
          <span>
            Verkstad:&nbsp;<strong className={styles.footerStrong}>#{workshopId}</strong>
          </span>
        )}
        <span className={styles.footerRight}>
          {loading
            ? "Laddar schema…"
            : error
            ? `Fel: ${error}`
            : `Arbetstider: ${whSegments.length} • Frånvaro: ${toSegments.length} • Bokningar: ${bookingItems.length}`}
        </span>
      </div>

      {/* Booking-modal */}
      {activeBooking && (
        <BookingDetailsModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onRefetch={async () => {
            // ladda om veckan (samma intervall) efter ändringar inne i modal
            if (!loadBookingsForUser) return;
            const from = new Date(weekStart);
            const toDate = addDays(from, 7);
            const result = await loadBookingsForUser(userId, toISO(from), toISO(toDate));
            setBookings((result ?? []).map(normalizeBooking));
          }}
        />
      )}
    </div>
  );
};

export default EmployeeCalendar;
