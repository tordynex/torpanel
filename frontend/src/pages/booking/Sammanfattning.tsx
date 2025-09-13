import React, { useEffect, useMemo, useState, useCallback } from "react";
import BookingLayout from "@/components/booking/BookingLayout.tsx";
import styles from "./css/Sammanfattning.module.css";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fetchAutoAvailability,
  autoScheduleBooking,
  type AvailabilityResponse,
  type AvailabilityProposal,
  type AutoScheduleRequest,
} from "@/services/bookingsService";
import { createBookingRequest } from "@/services/bookingrequestsService";
import { fetchWorkshopById, type Workshop } from "@/services/workshopService";
import { FiAlertCircle, FiClock, FiCalendar, FiChevronDown, FiChevronUp } from "react-icons/fi";

// ---- Storage keys ----
const STEP1_KEY = "autonexo.booking.step1"; // { reg, car, contact }
const STEP2_KEY = "autonexo.booking.step2"; // { workshopId, customer }
const STEP3_KEY = "autonexo.booking.step3"; // { serviceIds: number[], services?: [...] }

type Mode = "booking" | "request";

type ServiceMeta = {
  id: number;
  name?: string;
  request_only?: boolean;
  default_duration_min?: number | null;
  // prisfält från Valj-Tjanst (behövs för totalsumma ex moms)
  price_type?: "fixed" | "hourly";
  fixed_price_ore?: number | null;
  hourly_rate_ore?: number | null;
  vat_percent?: number | null;
};

const getQueryParam = (search: string, key: string) => {
  const qs = new URLSearchParams(search);
  return qs.getAll(key).length > 1 ? qs.getAll(key) : qs.get(key);
};

const todayISODate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const toLocalDateStartISO = (yyyy_mm_dd: string) => {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
};

const toLocalDateEndISO = (yyyy_mm_dd: string) => {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return dt.toISOString();
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

// Helpers: vardag/helg
const isWeekday = (yyyy_mm_dd: string) => {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun ... 6=Sat
  return day >= 1 && day <= 5;
};
const nextWeekday = (yyyy_mm_dd: string) => {
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  let day = dt.getDay();
  if (day === 6) dt.setDate(dt.getDate() + 2); // lör -> må
  else if (day === 0) dt.setDate(dt.getDate() + 1); // sön -> må
  const yy = dt.getFullYear();
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

export default function SammanfattningPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Query
  const carId = useMemo(() => {
    const v = getQueryParam(location.search, "carId");
    return v ? Number(v) : undefined;
  }, [location.search]);

  const workshopId = useMemo(() => {
    const v = getQueryParam(location.search, "workshopId");
    return v ? Number(v) : undefined;
  }, [location.search]);

  const serviceIds = useMemo<number[]>(() => {
    const v = getQueryParam(location.search, "serviceId");
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => Number(x)).filter(Boolean);
    return [Number(v)].filter(Boolean);
  }, [location.search]);

  // State
  const [regNr, setRegNr] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISODate());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<AvailabilityProposal | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [requestMessage, setRequestMessage] = useState<string>("");
  const [contactMe, setContactMe] = useState<boolean>(false); // tvingar förfrågan
  const [mode, setMode] = useState<Mode>("booking");

  // Metadata för valda tjänster (namn, request_only, duration + pris)
  const [servicesMeta, setServicesMeta] = useState<ServiceMeta[]>([]);
  const [showServiceList, setShowServiceList] = useState(false);

  // Verkstad (namn m.m.)
  const [workshop, setWorkshop] = useState<Workshop | null>(null);

  // Läs grunddata från sessionStorage
  useEffect(() => {
    try {
      const s1 = sessionStorage.getItem(STEP1_KEY);
      if (s1) {
        const data1 = JSON.parse(s1);
        if (data1?.car?.registration_number) setRegNr(data1.car.registration_number);
      }

      const s3raw = sessionStorage.getItem(STEP3_KEY);
      if (s3raw) {
        const data3 = JSON.parse(s3raw);
        const metaFromStep3: ServiceMeta[] | undefined = data3?.services;
        if (metaFromStep3?.length) {
          const filtered = metaFromStep3
            .filter((s: ServiceMeta) => serviceIds.includes(Number(s.id)))
            .map((s) => ({
              id: Number(s.id),
              name: s.name,
              request_only: !!s.request_only,
              default_duration_min:
                typeof s.default_duration_min === "number" ? s.default_duration_min : null,
              price_type: (s as any)?.price_type,
              fixed_price_ore: (s as any)?.fixed_price_ore ?? null,
              hourly_rate_ore: (s as any)?.hourly_rate_ore ?? null,
              vat_percent: (s as any)?.vat_percent ?? null,
            }));
          setServicesMeta(filtered);
        } else {
          setServicesMeta(
            serviceIds.map((id) => ({
              id,
              name: undefined,
              request_only: false,
              default_duration_min: null,
              price_type: undefined,
              fixed_price_ore: null,
              hourly_rate_ore: null,
              vat_percent: null,
            }))
          );
        }
      } else {
        setServicesMeta(
          serviceIds.map((id) => ({
            id,
            name: undefined,
            request_only: false,
            default_duration_min: null,
            price_type: undefined,
            fixed_price_ore: null,
            hourly_rate_ore: null,
            vat_percent: null,
          }))
        );
      }
    } catch {
      setServicesMeta(
        serviceIds.map((id) => ({
          id,
          name: undefined,
          request_only: false,
          default_duration_min: null,
          price_type: undefined,
          fixed_price_ore: null,
          hourly_rate_ore: null,
          vat_percent: null,
        }))
      );
    }
  }, [serviceIds]);

  // Hämta verkstadsinfo (namn etc.)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        if (!workshopId) {
          setWorkshop(null);
          return;
        }
        const w = await fetchWorkshopById(workshopId);
        if (mounted) setWorkshop(w);
      } catch {
        // fall back tyst – vi visar #id om namn inte kan hämtas
        if (mounted) setWorkshop(null);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [workshopId]);

  // Auto-korrigera om startdatum är helg
  useEffect(() => {
    if (!isWeekday(selectedDate)) {
      const next = nextWeekday(selectedDate);
      setSelectedDate(next);
      setAvailError("Endast måndag–fredag kan väljas. Datumet justerades till nästa vardag.");
    }
  }, []); // vid mount

  // --- Totaltid (min) och om någon är request_only
  const { totalMinutes, hasAnyRequestOnly } = useMemo(() => {
    const mins = servicesMeta.reduce((sum, s) => {
      const m =
        typeof s.default_duration_min === "number" && s.default_duration_min! > 0
          ? s.default_duration_min!
          : 60;
      return sum + m;
    }, 0);
    const anyReq = servicesMeta.some((s) => s.request_only === true);
    return { totalMinutes: mins, hasAnyRequestOnly: anyReq };
  }, [servicesMeta]);

  // --- Pris-summering: fastpris ex moms (ignorera request_only + hourly)
  const { fixedNetSumOre, uniformVat, hasHourly } = useMemo(() => {
    const nonRequestFixed = servicesMeta.filter(
      (s) => !s.request_only && s.price_type === "fixed" && typeof s.fixed_price_ore === "number"
    );
    const sum = nonRequestFixed.reduce((acc, s) => acc + (s.fixed_price_ore || 0), 0);
    const vatSet = new Set<number>();
    nonRequestFixed.forEach((s) => {
      if (typeof s.vat_percent === "number") vatSet.add(s.vat_percent);
    });
    const uniform = vatSet.size === 1 ? [...vatSet][0] : null;
    const anyHourly = servicesMeta.some((s) => !s.request_only && s.price_type === "hourly");
    return { fixedNetSumOre: sum, uniformVat: uniform, hasHourly: anyHourly };
  }, [servicesMeta]);

  const totalHoursLabel = useMemo(() => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h} h ${m} min`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  }, [totalMinutes]);

  // Vardag vald?
  const weekdaySelected = useMemo(() => isWeekday(selectedDate), [selectedDate]);

  // Deterministiskt läge (kontakt-override ingår)
  useEffect(() => {
    const wantRequest = contactMe || hasAnyRequestOnly || totalMinutes >= 240;
    setMode(wantRequest ? "request" : "booking");

    // städa ev. legacy mode i session
    try {
      const s3raw = sessionStorage.getItem(STEP3_KEY);
      if (s3raw) {
        const data3 = JSON.parse(s3raw);
        if (data3?.mode) {
          delete data3.mode;
          sessionStorage.setItem(STEP3_KEY, JSON.stringify(data3));
        }
      }
    } catch {}
  }, [contactMe, hasAnyRequestOnly, totalMinutes]);

  // Hämta availability när datum ändras (bara booking-läge + vardag + ej kontaktMe)
  useEffect(() => {
    const run = async () => {
      if (mode !== "booking") return;
      if (!weekdaySelected) return;
      if (!workshopId || !regNr || serviceIds.length === 0) return;

      setLoadingAvail(true);
      setAvailError(null);
      setAvailability(null);
      setSelectedProposal(null);
      setActionError(null);

      try {
        const req: any = {
          workshop_id: workshopId,
          registration_number: regNr,
          service_item_id: serviceIds[0], // API-krav: bara ett id
          earliest_from: toLocalDateStartISO(selectedDate),
          latest_end: toLocalDateEndISO(selectedDate),
          allow_fragmented_parts: true,
          num_proposals: 1,
          include_buffers: true,
          override_duration_min: totalMinutes, // total tid för alla valda
        };
        const res = await fetchAutoAvailability(req);
        setAvailability(res);
        const first = res?.proposals?.[0];
        if (first) {
          setSelectedProposal(first);
        } else {
          setAvailError(res?.reason_if_empty || "Inga lediga tider för vald dag.");
        }
      } catch (e: any) {
        console.error("[availability] error", e);
        setAvailError(e?.response?.data?.detail || "Kunde inte hämta lediga tider just nu.");
      } finally {
        setLoadingAvail(false);
      }
    };
    run();
  }, [mode, weekdaySelected, workshopId, regNr, serviceIds, selectedDate, totalMinutes]);

  // === BOOKING ===
  const doBook = useCallback(async () => {
    if (mode !== "booking") {
      setActionError("Fel läge för bokning.");
      return;
    }
    if (!workshopId) {
      setActionError("Saknar verkstad.");
      return;
    }
    if (!weekdaySelected) {
      setActionError("Välj en vardag (måndag–fredag).");
      return;
    }
    if (!selectedProposal) {
      setActionError(availError || "Ingen ledig tid hittad.");
      return;
    }

    setActionError(null);
    setActionLoading(true);

    try {
      const listText =
        servicesMeta
          .map((s) => {
            const mins =
              typeof s.default_duration_min === "number" && s.default_duration_min! > 0
                ? s.default_duration_min
                : 60;
            return `${s.id}${s.name ? ` – ${s.name}` : ""} (${mins} min${
              s.request_only ? ", request" : ""
            })`;
          })
          .join(", ") || serviceIds.join(", ");

      // Pris-notering (visa om fixedNetSumOre > 0 eller hourly finns)
      const notes: string[] = [];
      if (fixedNetSumOre > 0) {
        notes.push(
          `Fastpris (exkl. moms) totalt: ${(fixedNetSumOre / 100).toFixed(2)} SEK${
            typeof uniformVat === "number" ? ` (moms ${uniformVat}%)` : ""
          }.`
        );
      }
      if (hasHourly) {
        notes.push("Timpriser ingår inte i totalsumman och debiteras separat.");
      }

      const descriptionLines = [
        `Valda tjänster: ${listText}.`,
        `Sammanlagd estimerad arbetstid: ${totalMinutes} min.`,
        `Inlämningsdag: ${formatDate(`${selectedDate}T00:00:00`)}.`,
        ...(notes.length ? [notes.join(" ")] : []),
      ];

      const payload: AutoScheduleRequest = {
        workshop_id: workshopId!,
        bay_id: selectedProposal.bay_id,
        title: `Autonexo: ${regNr || "bil"} – service`,
        start_at: selectedProposal.start_at,
        end_at: selectedProposal.end_at,
        car_id: carId ?? undefined,
        registration_number: regNr,
        service_item_id: serviceIds[0] ?? null, // endast ett id kan skickas
        source: "autonexum-web",
        description: descriptionLines.join(" "),
        // PRIS: alltid EXKL. MOMS, endast för icke-request-only fixed
        price_net_ore: fixedNetSumOre > 0 ? fixedNetSumOre : undefined,
        vat_percent: typeof uniformVat === "number" ? uniformVat : undefined,
        price_is_custom: fixedNetSumOre > 0 ? true : undefined,
        price_note:
          fixedNetSumOre > 0 || hasHourly
            ? "Pris summerat för fasta tjänster exkl. moms. Timpriser (om valda) debiteras separat."
            : undefined,
      };

      const booking = await autoScheduleBooking(payload);

      const qs = new URLSearchParams();
      if ((booking as any)?.id) qs.set("bookingId", String((booking as any).id));
      navigate(`/boka/tack?${qs.toString()}`);
    } catch (e: any) {
      console.error("[book] error", e);
      setActionError(
        e?.response?.data?.detail?.message || e?.response?.data?.detail || "Kunde inte skapa bokningen. Försök igen."
      );
    } finally {
      setActionLoading(false);
    }
  }, [
    mode,
    workshopId,
    weekdaySelected,
    selectedProposal,
    availError,
    servicesMeta,
    totalMinutes,
    selectedDate,
    carId,
    regNr,
    serviceIds,
    fixedNetSumOre,
    uniformVat,
    hasHourly,
    navigate,
  ]);

  // === REQUEST ===
  const doSendRequest = useCallback(async () => {
    if (!workshopId) {
      setActionError("Saknar verkstad.");
      return;
    }
    if (!serviceIds.length) {
      setActionError("Saknar valda tjänster.");
      return;
    }
    if (!regNr) {
      setActionError("Saknar registreringsnummer.");
      return;
    }

    setActionError(null);
    setActionLoading(true);

    try {
      const s1 = JSON.parse(sessionStorage.getItem(STEP1_KEY) || "null");
      const s2 = JSON.parse(sessionStorage.getItem(STEP2_KEY) || "null");

      const customerId = s2?.customer?.id as number | undefined;
      const firstName = s1?.contact?.firstName || undefined;
      const lastName = s1?.contact?.lastName || undefined;
      const email = s1?.contact?.email || undefined;
      const phone = s1?.contact?.phone || undefined;

      const listText =
        servicesMeta
          .map((s) => {
            const mins =
              typeof s.default_duration_min === "number" && s.default_duration_min! > 0
                ? s.default_duration_min
                : 60;
            return `${s.id}${s.name ? ` – ${s.name}` : ""} (${mins} min${
              s.request_only ? ", request" : ""
            })`;
          })
          .join(", ") || serviceIds.join(", ");

      const pricingLine =
        fixedNetSumOre > 0
          ? `Fastpris (exkl. moms) totalt: ${(fixedNetSumOre / 100).toFixed(2)} SEK${
              typeof uniformVat === "number" ? ` (moms ${uniformVat}%)` : ""
            }.\n`
          : "";

      const hourlyLine = hasHourly ? "Timpriser ingår inte i totalsumman och debiteras separat.\n" : "";

      const summary =
        `Kunden har skickat en förfrågan.\n` +
        `Registreringsnummer: ${regNr}\n` +
        (selectedDate ? `Önskad inlämningsdag: ${selectedDate}\n` : "") +
        (requestMessage?.trim() ? `Meddelande: ${requestMessage.trim()}\n` : "") +
        `Valda service_item_id: ${serviceIds.join(", ")}\n` +
        `Beräknad total arbetstid: ${totalMinutes} min\n` +
        pricingLine +
        hourlyLine +
        `Tjänster: ${listText}\n`;

      await createBookingRequest({
        workshop_id: workshopId!,
        service_item_ids: serviceIds,
        customer_id: customerId ?? null,
        car_id: carId ?? null,
        registration_number: regNr,
        first_name: customerId ? undefined : firstName,
        last_name: customerId ? undefined : lastName,
        email: customerId ? undefined : email,
        phone: customerId ? undefined : phone,
        message: summary,
      } as any);

      navigate(`/boka/tack`);
    } catch (e: any) {
      console.error("[request] error", e);
      setActionError(e?.response?.data?.detail || "Kunde inte skicka förfrågan. Försök igen.");
    } finally {
      setActionLoading(false);
    }
  }, [
    workshopId,
    serviceIds,
    regNr,
    requestMessage,
    totalMinutes,
    servicesMeta,
    carId,
    navigate,
    fixedNetSumOre,
    uniformVat,
    hasHourly,
    selectedDate,
  ]);

  // Gemensam onNext
  const onNext = useCallback(() => {
    if (actionLoading) return;
    if (mode === "booking" && !contactMe) {
      if (!weekdaySelected) {
        setActionError("Välj en vardag (måndag–fredag).");
        return;
      }
      if (!selectedProposal) {
        // ingen tid → styr om till förfrågan
        setMode("request");
        return;
      }
      void doBook();
    } else {
      void doSendRequest();
    }
  }, [actionLoading, mode, contactMe, weekdaySelected, selectedProposal, doBook, doSendRequest]);

  // Navigering via stepper
  const handleStepChange = (next: 1 | 2 | 3 | 4) => {
    if (next === 3) {
      const qs = new URLSearchParams();
      if (carId) qs.set("carId", String(carId));
      if (workshopId) qs.set("workshopId", String(workshopId));
      serviceIds.forEach((id) => qs.append("serviceId", String(id)));
      navigate(`/boka/valj-tjanst?${qs.toString()}`);
    }
  };

  // UI derived
  const nearestStart = selectedProposal?.start_at ?? null;
  const estimatedEnd = selectedProposal?.end_at ?? null;

  const anyHardReasonToRequest =
    contactMe ||
    mode === "request" ||
    hasAnyRequestOnly ||
    totalMinutes >= 240 ||
    (!!availError && mode !== "booking");

  const showAvailabilitySection = !anyHardReasonToRequest && weekdaySelected;

  const workshopLabel =
    workshop?.name
      ? workshop.name
      : (typeof workshopId === "number" ? `#${workshopId}` : "—");

  return (
    <BookingLayout
      step={4}
      onStepChange={handleStepChange}
      canProceed={true}
      onPrev={() => {
        const qs = new URLSearchParams();
        if (carId) qs.set("carId", String(carId));
        if (workshopId) qs.set("workshopId", String(workshopId));
        serviceIds.forEach((id) => qs.append("serviceId", String(id)));
        navigate(`/boka/valj-tjanst?${qs.toString()}`);
      }}
      onNext={onNext}
      headerActions={
        <a className={styles.helpLink} href="#" onClick={(e) => e.preventDefault()}>
          Behöver du hjälp?
        </a>
      }
    >
      {/* Översikt */}
      <section className={styles.summaryCard}>
        <h3 className={styles.cardTitle}>Översikt</h3>
        <div className={styles.summaryGrid}>
          <div>
            <div className={styles.kv}>
              <span className={styles.k}>Registreringsnummer</span>
              <span className={styles.v}>{regNr || "—"}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.k}>Verkstad</span>
              <span className={styles.v}>{workshopLabel}</span>
            </div>
          </div>
          <div>
            <div className={styles.kv}>
              <span className={styles.k}>Antal tjänster</span>
              <span className={styles.v}>{serviceIds.length || "—"}</span>
            </div>
            <div className={styles.kv}>
              <span className={styles.k}>Total arbetstid</span>
              <span className={styles.v}>{totalHoursLabel}</span>
            </div>
          </div>
        </div>

        {(fixedNetSumOre > 0 || hasHourly) && (
          <p className={styles.muted}>
            {fixedNetSumOre > 0 && (
              <>
                Fastpris <em>exkl. moms</em> totalt:{" "}
                <strong>{(fixedNetSumOre / 100).toFixed(2)} kr</strong>
                {typeof uniformVat === "number" ? <> (moms {uniformVat}%)</> : null}.
              </>
            )}{" "}
            {hasHourly && <>Timpriser ingår inte i totalsumman och debiteras separat.</>}
          </p>
        )}

        {/* Expanderbar lista över tjänster */}
        {servicesMeta.length > 0 && (
          <div className={styles.spacedTop}>
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setShowServiceList((s) => !s)}
              aria-expanded={showServiceList}
            >
              {showServiceList ? <FiChevronUp aria-hidden /> : <FiChevronDown aria-hidden />}{" "}
              Visa {showServiceList ? "mindre" : "alla tjänster"}
            </button>
            {showServiceList && (
              <ul className={styles.serviceList}>
                {servicesMeta.map((s) => (
                  <li key={s.id} className={styles.serviceListItem}>
                    <span className={styles.pill}>#{s.id}</span>{" "}
                    <strong>{s.name || "Tjänst"}</strong>{" "}
                    <span className={styles.mutedSmall}>
                      {s.request_only ? "• kräver förfrågan" : "• bokningsbar"}
                      {" · "}
                      {typeof s.default_duration_min === "number" && s.default_duration_min! > 0
                        ? `${s.default_duration_min} min`
                        : "60 min"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Datum + kontakt-checkbox */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>
          <FiCalendar aria-hidden /> Välj inlämningsdag (endast vardagar)
        </h3>

        <div className={styles.dateRow}>
          <div className={styles.dateAndHelp}>
            <input
              className={styles.dateInput}
              type="date"
              value={selectedDate}
              min={todayISODate()}
              onChange={(e) => {
                const v = e.target.value;
                if (!isWeekday(v)) {
                  const next = nextWeekday(v);
                  setSelectedDate(next);
                  setAvailError("Endast måndag–fredag kan väljas. Datumet justerades till nästa vardag.");
                } else {
                  setSelectedDate(v);
                  setAvailError(null);
                }
              }}
              aria-describedby="date-help"
            />
            <p id="date-help" className={styles.mutedSmall}>
              Lämna in bilen på morgonen den valda vardagen.
            </p>
          </div>

          {/* Checkbox: naturligt planterad bredvid/under datum. På mobil ligger den under. */}
          <label className={styles.checkboxWrap}>
            <input
              type="checkbox"
              checked={contactMe}
              onChange={(e) => setContactMe(e.target.checked)}
              className={styles.checkboxInput}
            />
            <span className={styles.customBox} aria-hidden="true" />
            <span className={styles.checkboxLabel}>Jag vill att verkstad kontaktar mig</span>
          </label>
        </div>

        <p className={styles.muted}>
          {contactMe
            ? "Vi skickar en förfrågan med dina uppgifter. Verkstaden återkommer med tid och pris."
            : "Exakt starttid planeras internt av verkstaden."}
        </p>

        {!weekdaySelected && (
          <div className={styles.alert} role="alert">
            <FiAlertCircle aria-hidden /> Endast måndag–fredag kan väljas.
          </div>
        )}
        {availError && !loadingAvail && showAvailabilitySection && (
          <div className={styles.alert} role="alert">
            <FiAlertCircle aria-hidden /> {availError}
          </div>
        )}
      </section>

      {/* Tillgänglighet – endast booking-läge, vardag, ej kontaktMe */}
      {!anyHardReasonToRequest && weekdaySelected && (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>
            <FiClock aria-hidden /> Tillgänglighet (sammanlagd tid: {totalHoursLabel})
          </h3>

          {loadingAvail && <div className={styles.info}>Beräknar närmaste möjliga tid…</div>}

          {!loadingAvail && !availError && nearestStart && estimatedEnd && (
            <div className={styles.availabilityBox}>
              <div className={styles.line}>
                Närmsta möjliga start: <strong>{formatTime(nearestStart)}</strong> ({formatDate(nearestStart)})
              </div>
              <div className={styles.line}>
                Beräknad klar:{" "}
                <strong>
                  {formatDate(estimatedEnd)} kl {formatTime(estimatedEnd)}
                </strong>
              </div>
              <p className={styles.note}>Förslaget tar hänsyn till alla valda tjänster och deras samlade tid.</p>
            </div>
          )}
        </section>
      )}

      {/* Förfrågan – kontaktMe eller övriga skäl */}
      {anyHardReasonToRequest && (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>
            <FiClock aria-hidden /> Förfrågan till verkstaden
          </h3>
          <div className={styles.info}>Din förfrågan skickas till verkstaden som kontaktar dig med tid och pris.</div>

          <label className={styles.filterLabel} htmlFor="reqmsg">
            Meddelande till verkstaden (valfritt)
          </label>

          <div className={styles.field} aria-live="polite">
            <div className={styles.textareaWrap}>
              <FiAlertCircle aria-hidden className={styles.leadingIcon} />
              <textarea
                id="reqmsg"
                className={styles.textarea}
                placeholder="Beskriv gärna ditt ärende, ljud, lampor, önskad tid m.m."
                rows={3}
                maxLength={600}
                spellCheck
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                aria-describedby="reqmsg-hint reqmsg-count"
              />
              {requestMessage && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setRequestMessage("")}
                  aria-label="Rensa meddelandet"
                  title="Rensa"
                >
                  ×
                </button>
              )}
            </div>

            <div className={styles.fieldFooter}>
              <span id="reqmsg-hint" className={styles.hint}>
                Ge lite kontext så återkommer verkstaden snabbare.
              </span>
              <span id="reqmsg-count" className={styles.counter}>
                {requestMessage.length}/600
              </span>
            </div>

            {/* Snabbval (valfritt) */}
            <div className={styles.chipRow} role="listbox" aria-label="Snabbval">
              {["Önskar lånebil", "Jag kan lämna efter kl 08", "Högt ljud fram", "Varningslampa lyser"].map((txt) => (
                <button
                  key={txt}
                  type="button"
                  className={styles.chip}
                  onClick={() =>
                    setRequestMessage((v) => (v ? (v.endsWith(" ") ? v + txt : v + " " + txt) : txt))
                  }
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Fel vid bokning/förfrågan */}
      {actionError && (
        <div className={styles.alert} role="alert">
          <FiAlertCircle aria-hidden /> {actionError}
        </div>
      )}

      {/* CTA-text */}
      <p className={styles.footerNote}>
        {!anyHardReasonToRequest ? (
          <>
            Granska uppgifterna och klicka på <strong>Boka nu</strong> när du är redo.
          </>
        ) : (
          <>
            Granska uppgifterna och klicka på <strong>Skicka förfrågan</strong> när du är redo.
          </>
        )}
      </p>
    </BookingLayout>
  );
}
