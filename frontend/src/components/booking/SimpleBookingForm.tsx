// SimpleBookingForm.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchWorkshopServiceItems,
  fetchWorkshopEmployees,
  type WorkshopServiceItem,
  type UserSimple,
} from "@/services/workshopService";
import {
  fetchAutoAvailability,
  autoScheduleBooking,
  type AvailabilityRequest,
  type AvailabilityProposal,
  type BayBookingRead,
} from "@/services/bookingsService";

import {
  FiCalendar,
  FiClock,
  FiSearch,
  FiUser,
  FiCheckCircle,
  FiXCircle,
  FiChevronDown,
  FiPlus,
  FiEdit3,
  FiRefreshCcw,
} from "react-icons/fi";
import { PiWrenchFill } from "react-icons/pi";
import { MdOutlineDirectionsCarFilled } from "react-icons/md";

import styles from "./css/SimpleBookingForm.module.css";

// --- NYTT: separerad tabell med förslag ---
import BookingProposition from "./BookingProposition";

// --- Car-lookup + create flow
import type { Car } from "@/services/carService";
import carService, { fetchCarByReg } from "@/services/carService";
import CreateCarForm from "@/components/workshop/CreateCarForm_Booking";
import Modal from "@/components/common/Modal";

// --- CRM (KUND) ---
import crmService, { type Customer } from "@/services/crmService";

// --- Pricing (extracted)
import PriceSection, {
  computePrice,
  type PriceConfig,
  defaultPriceConfig,
} from "./PriceComponents";

// -------------------------------------------------------
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { hour12: false });

const toOffsetISO = (val?: string) => {
  if (!val) return undefined;
  const [datePart, timePart] = val.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);

  const tzOffsetMin = -dt.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const offAbs = Math.abs(tzOffsetMin);
  const offH = String(Math.floor(offAbs / 60)).padStart(2, "0");
  const offM = String(offAbs % 60).padStart(2, "0");

  const yyyy = dt.getFullYear();
  const MM = String(dt.getMonth() + 1).padStart(2, "0");
  const DD = String(dt.getDate()).padStart(2, "0");
  const HH = String(dt.getHours()).padStart(2, "0");
  const II = String(dt.getMinutes()).padStart(2, "0");

  return `${yyyy}-${MM}-${DD}T${HH}:${II}:00${sign}${offH}:${offM}`;
};

// Bygger ISO med offset för start av given dag (00:00 lokal tid)
const toOffsetISOStartOfDay = (dateOnly: string | undefined) => {
  if (!dateOnly) return undefined;
  return toOffsetISO(`${dateOnly}T00:00`);
};

// Bygger ISO med offset för början av dagen EFTER given dag (00:00 nästa dag)
// Bra som exklusiv "latest_end" så att hela sista dagen inkluderas.
const toOffsetISONextDayStart = (dateOnly: string | undefined) => {
  if (!dateOnly) return undefined;
  const d = new Date(`${dateOnly}T00:00`);
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  return toOffsetISO(`${yyyy}-${MM}-${DD}T00:00`);
};

// -------------------------------------------------------
function useWorkshopData(workshopId: number) {
  const [items, setItems] = useState<WorkshopServiceItem[]>([]);
  const [employees, setEmployees] = useState<UserSimple[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [it, emps] = await Promise.all([
          fetchWorkshopServiceItems(workshopId, { is_active: true }),
          fetchWorkshopEmployees(workshopId, [
            "workshop_employee",
            "workshop_user",
          ]),
        ]);
        if (!mounted) return;
        setItems(it || []);
        setEmployees(emps || []);
      } catch (e: any) {
        console.error(e);
        setError(
          e?.response?.data?.detail ?? "Kunde inte ladda verkstadsdata."
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, [workshopId]);

  return { items, employees, error, setError } as const;
}

function useCarSearch(registration: string) {
  const [matches, setMatches] = useState<Car[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = registration.trim();
      if (q.length < 2) {
        setMatches([]);
        return;
      }
      setLoadingCars(true);
      try {
        const all = await carService.fetchAllCars();
        if (cancelled) return;
        const qLower = q.toLowerCase();
        setMatches(
          all.filter((car) =>
            car.registration_number.toLowerCase().includes(qLower)
          )
        );
      } catch (err) {
        console.error("Kunde inte hämta bilar", err);
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoadingCars(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registration]);

  return { matches, loadingCars } as const;
}

// -------------------------------------------------------
type Props = {
  workshopId: number;
  defaultRegistration?: string;
  defaultServiceItemId?: number;
  defaultPreferUserId?: number;
  onSuccess?: (booking: BayBookingRead) => void;
  onCancel?: () => void;
  className?: string;
};

const SimpleBookingForm: React.FC<Props> = ({
  workshopId,
  defaultRegistration = "",
  defaultServiceItemId,
  defaultPreferUserId,
  onSuccess,
  onCancel,
  className,
}) => {
  // -----------------------------------------------------
  // Form state
  // -----------------------------------------------------
  const [registration, setRegistration] = useState(defaultRegistration);
  const [serviceItemId, setServiceItemId] = useState<number | "">(
    defaultServiceItemId ?? ""
  );
  const [earliestFrom, setEarliestFrom] = useState<string>("");
  const [latestEnd, setLatestEnd] = useState<string>("");
  const [preferUserId, setPreferUserId] = useState<number | "">(
    defaultPreferUserId ?? ""
  );
  const [numProposals, setNumProposals] = useState<number>(3);
  const [dateMode, setDateMode] = useState<"latest" | "range">("latest");

  const [rangeStartDate, setRangeStartDate] = useState<string>("");
  const [rangeEndDate, setRangeEndDate] = useState<string>("");

  // Data
  const {
    items,
    employees,
    error: baseError,
    setError: setBaseError,
  } = useWorkshopData(workshopId);

  // Availability / booking
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(baseError);
  const [proposals, setProposals] = useState<AvailabilityProposal[]>([]);
  const [reasonEmpty, setReasonEmpty] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [bufferBefore, setBufferBefore] = useState<number>(0);
  const [bufferAfter, setBufferAfter] = useState<number>(0);
  const [confirmedCar, setConfirmedCar] = useState<Car | null>(null);

  // Pris
  const [priceConfig, setPriceConfig] = useState<PriceConfig>(
    defaultPriceConfig()
  );

  // Helpers
  const chosenItem = useMemo(
    () => items.find((i) => i.id === serviceItemId),
    [items, serviceItemId]
  );
  const selectedProposal = useMemo(
    () => (selectedIndex != null ? proposals[selectedIndex] : undefined),
    [selectedIndex, proposals]
  );

  useEffect(() => {
    const base = chosenItem?.name ?? "Verkstadstid";
    const reg = registration ? ` • ${registration.trim().toUpperCase()}` : "";
    setTitle(`${base}${reg}`);
  }, [chosenItem, registration]);

  // Car search + preview + create
  const { matches, loadingCars } = useCarSearch(registration);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [prefillReg, setPrefillReg] = useState<string>("");

  const [previewCar, setPreviewCar] = useState<Car | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [errorPreview, setErrorPreview] = useState<string | null>(null);

  const normalizeReg = (s: string) => s.toUpperCase().replace(/\s+/g, "");
  const normalizeEmail = (s: string) => s.trim().toLowerCase();
  const normalizePhoneSE = (raw: string) => {
      if (!raw) return "";
      const cleaned = raw.replace(/[^\d+]/g, "");

      // Tillåt andra landskoder orörda (ta bort detta block om du vill tvinga +46)
      if (cleaned.startsWith("+") && !cleaned.startsWith("+46")) {
        return cleaned;
      }

      if (cleaned.startsWith("+46")) {
        const rest = cleaned.slice(3).replace(/^0+/, "");
        return "+46" + rest;
      }

      if (cleaned.startsWith("0")) {
        return "+46" + cleaned.replace(/^0+/, "");
      }

      if (/^\d+$/.test(cleaned)) {
        return "+46" + cleaned.replace(/^0+/, "");
      }

      return cleaned;
    };


  const openPreviewForCar = (car: Car) => {
    setErrorPreview(null);
    setPreviewCar(car);
  };
  const openPreviewByReg = async (reg: string) => {
    setErrorPreview(null);
    setLoadingPreview(true);
    try {
      const car = await fetchCarByReg(reg.replace(/\s+/g, ""));
      openPreviewForCar(car);
    } catch (e) {
      console.error(e);
      setErrorPreview("Kunde inte hämta bil med det regnumret.");
    } finally {
      setLoadingPreview(false);
    }
  };
  const onConfirmPreview = () => {
    if (previewCar) {
      setRegistration(previewCar.registration_number);
      setConfirmedCar(previewCar);
      setPreviewCar(null);
      setShowCreateForm(false);
    }
  };

  const trimmedReg = registration.trim();
  const canShowAddButton =
    trimmedReg.length >= 2 && !loadingCars && matches.length === 0;

  // Varaktighet
  const estimatedMin = useMemo(
    () => Number(chosenItem?.default_duration_min ?? 60),
    [chosenItem]
  );
  const [durationMin, setDurationMin] = useState<number>(estimatedMin);
  useEffect(() => setDurationMin(estimatedMin), [estimatedMin]);

  // -----------------------------------------------------
  // NYTT: Kund-koppling till vald bil
  // -----------------------------------------------------
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [primaryCustomer, setPrimaryCustomer] = useState<Customer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [errorCustomers, setErrorCustomers] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState("");
  const [allowFragmentedParts, setAllowFragmentedParts] = useState(false);


  // Inline add/edit
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [custFirst, setCustFirst] = useState("");
  const [custLast, setCustLast] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custSetPrimary, setCustSetPrimary] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const refreshCustomers = async (car: Car) => {
    setLoadingCustomers(true);
    setErrorCustomers(null);
    setSuccessNote("");
    try {
      const [list, primary] = await Promise.all([
        crmService.fetchCarCustomers(car.id, workshopId),
        crmService
          .fetchPrimaryCustomerForCar(car.id, workshopId)
          .catch(() => null),
      ]);
      setCustomers(list || []);
      setPrimaryCustomer(primary || null);
    } catch (e) {
      console.error(e);
      setErrorCustomers("Kunde inte hämta kopplade kunder.");
      setCustomers([]);
      setPrimaryCustomer(null);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // När bilen bekräftas -> ladda kunddata
  useEffect(() => {
    if (confirmedCar) refreshCustomers(confirmedCar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedCar?.id]);

  const setAsPrimary = async (customerId: number) => {
      if (!confirmedCar) return;
      setLoadingCustomers(true);
      setErrorCustomers(null);
      setSuccessNote("");

      try {
        // 1) Hämta befintlig kund (för att återanvända kontaktfält)
        const c = await crmService.fetchCustomerById(customerId);

        // 2) Skicka KORREKT payload till backend:
        //    - använd aktuell verkstad: workshopId (prop)
        //    - länka till bilen med car_id (säkert och entydigt)
        //    - set_primary: true (det här gör kunden primär för bilen)
        const payload = {
          workshop_id: workshopId,
          first_name: c.first_name || undefined,
          last_name: c.last_name || undefined,
          email: c.email || undefined,
          phone: c.phone ? normalizePhoneSE(c.phone) : undefined,
          car_id: confirmedCar.id,
          set_primary: true,
        } as const;

        // Debug (valfritt): se vad som skickas
        // console.log("setAsPrimary payload:", payload);

        await crmService.createCustomer(payload);

        await refreshCustomers(confirmedCar);
        setSuccessNote("Primär kund uppdaterad.");
      } catch (e) {
        console.error(e);
        setErrorCustomers("Kunde inte sätta primär kund.");
      } finally {
        setLoadingCustomers(false);
      }
    };

  const canSaveInlineCustomer = useMemo(() => {
    const hasContact =
      (custEmail && custEmail.trim().length > 0) ||
      (custPhone && custPhone.trim().length > 0);
    return !!confirmedCar && hasContact;
  }, [confirmedCar, custEmail, custPhone]);

  const saveInlineCustomer = async () => {
    if (!confirmedCar) return;
    if (!canSaveInlineCustomer) return;
    setSavingCustomer(true);
    setErrorCustomers(null);
    setSuccessNote("");
    try {
      await crmService.createCustomer({
        workshop_id: workshopId,
        first_name: custFirst || undefined,
        last_name: custLast || undefined,
        email: custEmail ? normalizeEmail(custEmail) : undefined,
        phone: custPhone ? normalizePhoneSE(custPhone) : undefined,
        registration_number: confirmedCar.registration_number,
        set_primary: custSetPrimary,
      });
      await refreshCustomers(confirmedCar);
      setShowAddCustomer(false);
      setCustFirst("");
      setCustLast("");
      setCustEmail("");
      setCustPhone("");
      setCustSetPrimary(true);
      setSuccessNote("Kund kopplad till bilen.");
    } catch (e) {
      console.error(e);
      setErrorCustomers("Kunde inte koppla kund. Kontrollera uppgifterna.");
    } finally {
      setSavingCustomer(false);
    }
  };

  // -----------------------------------------------------
  // Actions: sök & boka
  // -----------------------------------------------------
  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setProposals([]);
    setSelectedIndex(null);
    setReasonEmpty(null);

    try {
      if (!serviceItemId || !registration.trim()) {
        setError("Fyll i registreringsnummer och välj åtgärd.");
        setLoading(false);
        return;
      }

      if (dateMode === "range") {
          if (!rangeStartDate || !rangeEndDate) {
            setError("Välj både första och sista dag.");
            setLoading(false);
            return;
          }
        }

      const payload: AvailabilityRequest = {
        workshop_id: workshopId,
        registration_number: registration.trim().toUpperCase(),
        service_item_id: Number(serviceItemId),
        ...(dateMode === "range"
          ? {
              earliest_from: toOffsetISOStartOfDay(rangeStartDate),
              latest_end: toOffsetISONextDayStart(rangeEndDate),
            }
          : {
              earliest_from: toOffsetISO(earliestFrom),
              latest_end: toOffsetISO(latestEnd),
            }),
        prefer_user_id: preferUserId ? Number(preferUserId) : undefined,
        num_proposals: numProposals,
        override_duration_min: durationMin,

        min_lead_time_min: 30,
        allow_fragmented_parts: allowFragmentedParts,

        return_candidates: true,
        max_candidates_per_slot: 5,
      };

      const res = await fetchAutoAvailability(payload);
      setProposals(res.proposals || []);
      setReasonEmpty(res.reason_if_empty || null);
      if (res.proposals?.length) setSelectedIndex(0);
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.detail ?? "Kunde inte hämta tillgänglighet.";
      setError(msg);
      setBaseError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onBook = async () => {
    if (!selectedProposal || !chosenItem) return;
    try {
      setLoading(true);
      setError(null);

      const { netOre: price_net_ore, grossOre: price_gross_ore, vatPercent } =
        computePrice({
          item: chosenItem,
          durationMin,
          config: priceConfig,
        });

      const parts =
        selectedProposal.parts && selectedProposal.parts.length > 0
          ? selectedProposal.parts
          : [
              {
                start_at: selectedProposal.start_at,
                end_at: selectedProposal.end_at,
              },
            ];

      // HYBRID: välj rekommenderad mek om assigned_user_id saknas i förslaget
      const chosenAssignedUserId =
        selectedProposal.assigned_user_id ??
        (selectedProposal.meta?.recommended_user_id ?? undefined);

      const totalParts = parts.length;
      const results: BayBookingRead[] = [];

      const chainToken =
        totalParts > 1
          ? (typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2))
          : undefined;

      for (let i = 0; i < totalParts; i++) {
        const part = parts[i];
        const isFirst = i === 0;
        const isLast = i === totalParts - 1;
        const bufBefore = isFirst ? bufferBefore || 0 : 0;
        const bufAfter = isLast ? bufferAfter || 0 : 0;

        const res = await autoScheduleBooking({
          workshop_id: workshopId,
          bay_id: selectedProposal.bay_id,
          start_at: part.start_at,
          end_at: part.end_at,
          assigned_user_id: chosenAssignedUserId, // <-- ändring här
          title: `${title || "Bokning"}${
            totalParts > 1 ? ` (del ${i + 1}/${totalParts})` : ""
          }`,
          description: description || undefined,
          buffer_before_min: bufBefore,
          buffer_after_min: bufAfter,

          car_id: confirmedCar ? confirmedCar.id : undefined,
          registration_number: registration.trim().toUpperCase(),

          service_item_id: chosenItem.id,
          source: "ui_simple_form_parts",

          price_net_ore: isFirst ? price_net_ore : undefined,
          price_gross_ore: isFirst ? price_gross_ore : undefined,
          vat_percent: isFirst ? vatPercent : undefined,
          price_note: isFirst
            ? priceConfig.customPriceNote || undefined
            : undefined,
          price_is_custom: isFirst
            ? (priceConfig.useCustomPrice || undefined)
            : undefined,

          chain_token: chainToken,
        });

        results.push(res);
      }

      onSuccess?.(results[results.length - 1]);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.detail ?? "Kunde inte skapa bokning.");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------
  // UI
  // -----------------------------------------------------
  const computedEndForSummary = selectedProposal?.end_at;

  return (
      <div className={`${styles.shell} ${className ?? ""}`}>
        <header className={styles.formHeader}></header>

        <form onSubmit={onSearch}>
          <fieldset disabled={loading} aria-busy={loading}>
            {/* STEG 1: Bil */}
            <section className={styles.card}>
              <div className={styles.stepBadge}>1</div>
              <h3 className={styles.cardTitle}>Bil</h3>

              {!confirmedCar ? (
                <>
                  <div className={styles.field}>
                    <label htmlFor="reg" className={styles.label}>
                      Registreringsnummer
                    </label>
                    <div className={styles.inputWrap}>
                      <span className={styles.inputIcon}>
                        <MdOutlineDirectionsCarFilled />
                      </span>
                      <input
                        id="reg"
                        className={styles.input}
                        type="text"
                        value={registration}
                        onChange={(e) =>
                          setRegistration(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && registration.trim().length >= 2) {
                            e.preventDefault();
                            e.stopPropagation();
                            openPreviewByReg(registration.trim());
                          }
                        }}
                        placeholder="ABC123"
                        autoComplete="off"
                        aria-label="Sök regnummer"
                      />
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Sök bil"
                        onClick={() => {
                          if (registration.trim().length >= 2)
                            openPreviewByReg(registration.trim());
                        }}
                      >
                        <FiSearch />
                      </button>
                    </div>

                    {registration.trim().length < 2 && (
                      <div className={styles.muted}>
                        Skriv minst två tecken för att söka.
                      </div>
                    )}

                    {matches.length > 0 && (
                      <div className={styles.resultBox} role="list">
                        {loadingCars ? (
                          <div className={styles.muted}>Laddar…</div>
                        ) : (
                          matches.map((car) => (
                            <div key={car.id} role="listitem" className={styles.row}>
                              <div>
                                <strong>{car.registration_number}</strong>
                                {car.brand ? ` – ${car.brand}` : ""}{" "}
                                {car.model_year ? `(${car.model_year})` : ""}
                              </div>
                              <button
                                type="button"
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={() => openPreviewForCar(car)}
                              >
                                Välj
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {canShowAddButton && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => {
                          setPrefillReg(normalizeReg(trimmedReg));
                          setShowCreateForm(true);
                        }}
                        disabled={loadingPreview}
                      >
                        <FiPlus style={{ marginRight: 6 }} /> Lägg till bil
                      </button>
                    )}
                  </div>

                  {showCreateForm && (
                    <div className={styles.field}>
                      <CreateCarForm
                        workshopId={workshopId}
                        initialRegistration={prefillReg}
                        onCreated={(car) => {
                          setRegistration(car.registration_number);
                          setConfirmedCar(car);
                          setShowCreateForm(false);
                          setPrefillReg("");
                          // Ladda in ev. kund direkt efter skap
                          refreshCustomers(car);
                        }}
                        onCancel={() => {
                          setShowCreateForm(false);
                          setPrefillReg("");
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.field}>
                  <div className={styles.label}>Vald bil</div>
                  <div className={styles.chosenCar}>
                    <div className={styles.chosenCarMain}>
                      <strong>{confirmedCar.registration_number}</strong>
                      {confirmedCar.brand ? ` – ${confirmedCar.brand}` : ""}{" "}
                      {confirmedCar.model_year ? `(${confirmedCar.model_year})` : ""}
                    </div>
                    <button
                      type="button"
                      className={styles.btnLink}
                      onClick={() => {
                        setConfirmedCar(null);
                        setRegistration("");
                        setCustomers([]);
                        setPrimaryCustomer(null);
                        setErrorCustomers(null);
                        setSuccessNote("");
                        setShowAddCustomer(false);
                      }}
                    >
                      Byt bil
                    </button>
                  </div>

                  {/* ===== Kund kopplad till bil ===== */}
                  <div style={{ marginTop: 12 }}>
                    <div className={styles.cardTitle} style={{ fontSize: "1rem" }}>
                      Kund kopplad till bil
                    </div>

                    {loadingCustomers ? (
                      <div className={styles.muted} style={{ marginTop: 6 }}>
                        Laddar kunder…
                      </div>
                    ) : errorCustomers ? (
                      <div className={styles.alert} style={{ marginTop: 6 }}>
                        {errorCustomers}
                      </div>
                    ) : (
                      <>
                        <div className={styles.inlineGrid} style={{ marginTop: 6 }}>
                          <div>
                            <div className={styles.smallLabel}>Primär kund</div>
                            {primaryCustomer ? (
                              <div className={styles.muted}>
                                <strong>
                                  {primaryCustomer.first_name || "—"}{" "}
                                  {primaryCustomer.last_name || ""}
                                </strong>
                                <div>
                                  {primaryCustomer.email || "—"}
                                  {primaryCustomer.phone
                                    ? ` • ${primaryCustomer.phone}`
                                    : ""}
                                </div>
                              </div>
                            ) : (
                              <div className={styles.muted}>Ingen vald.</div>
                            )}
                          </div>
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <div className={styles.smallLabel}>Alla kopplade</div>
                          {customers.length === 0 ? (
                            <div className={styles.muted}>Inga kunder kopplade ännu.</div>
                          ) : (
                            <div className={styles.resultBox} style={{ marginTop: 6 }}>
                              {customers.map((c) => {
                                const isPrimary =
                                  primaryCustomer && c.id === primaryCustomer.id;
                                return (
                                  <div
                                    key={c.id}
                                    className={styles.row}
                                    style={{ alignItems: "center" }}
                                  >
                                    <div>
                                      <strong>
                                        {c.first_name || "—"} {c.last_name || ""}
                                      </strong>
                                      <div className={styles.muted}>
                                        {c.email || "—"}
                                        {c.phone ? ` • ${c.phone}` : ""}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                      {!isPrimary && (
                                        <button
                                          type="button"
                                          className={`${styles.btn} ${styles.btnPrimary}`}
                                          onClick={() => setAsPrimary(c.id)}
                                          disabled={loadingCustomers}
                                          title="Sätt som primär kund"
                                        >
                                          Sätt som primär
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => confirmedCar && refreshCustomers(confirmedCar)}
                            disabled={loadingCustomers}
                          >
                            <FiRefreshCcw />
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={() => setShowAddCustomer((v) => !v)}
                            disabled={loadingCustomers}
                          >
                            {showAddCustomer ? "Avbryt" : "Lägg till & koppla kund"}
                          </button>
                        </div>

                        {showAddCustomer && (
                          <div className={styles.resultBox} style={{ marginTop: 10, padding: 10 }}>
                            <div
                              className={styles.inlineGrid}
                              style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}
                            >
                              <div>
                                <label htmlFor="custFirst" className={styles.label}>
                                  Förnamn
                                </label>
                                <input
                                  id="custFirst"
                                  className={styles.input}
                                  value={custFirst}
                                  onChange={(e) => setCustFirst(e.target.value)}
                                  placeholder="Anna"
                                  autoComplete="given-name"
                                />
                              </div>
                              <div>
                                <label htmlFor="custLast" className={styles.label}>
                                  Efternamn
                                </label>
                                <input
                                  id="custLast"
                                  className={styles.input}
                                  value={custLast}
                                  onChange={(e) => setCustLast(e.target.value)}
                                  placeholder="Berg"
                                  autoComplete="family-name"
                                />
                              </div>
                              <div>
                                <label htmlFor="custEmail" className={styles.label}>
                                  E-post{" "}
                                  <span className={styles.muted}>
                                    (minst e-post eller telefon)
                                  </span>
                                </label>
                                <input
                                  id="custEmail"
                                  className={styles.input}
                                  type="email"
                                  value={custEmail}
                                  onChange={(e) => setCustEmail(e.target.value)}
                                  placeholder="anna@exempel.se"
                                  autoComplete="email"
                                />
                              </div>
                              <div>
                                <label htmlFor="custPhone" className={styles.label}>
                                  Telefon{" "}
                                  <span className={styles.muted}>
                                    (minst e-post eller telefon)
                                  </span>
                                </label>
                                <input
                                  id="custPhone"
                                  className={styles.input}
                                  type="tel"
                                  value={custPhone}
                                  onChange={(e) => setCustPhone(e.target.value)}
                                  onBlur={() => setCustPhone(normalizePhoneSE(custPhone))} // <= nytt
                                  placeholder="+4670…"
                                  autoComplete="tel"
                                />
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginTop: 8,
                              }}
                            >
                              <input
                                id="custSetPrimary"
                                type="checkbox"
                                checked={custSetPrimary}
                                onChange={(e) => setCustSetPrimary(e.target.checked)}
                              />
                              <label
                                htmlFor="custSetPrimary"
                                className={styles.label}
                                style={{ margin: 0 }}
                              >
                                Sätt som primär kontakt för {confirmedCar.registration_number}
                              </label>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={saveInlineCustomer}
                                disabled={savingCustomer || !canSaveInlineCustomer}
                              >
                                {savingCustomer ? "Sparar…" : "Spara & koppla kund"}
                              </button>
                              <button
                                type="button"
                                className={`${styles.btn} ${styles.btnGhost}`}
                                onClick={() => setShowAddCustomer(false)}
                                disabled={savingCustomer}
                              >
                                Avbryt
                              </button>
                            </div>
                          </div>
                        )}

                        {successNote && (
                          <div className={styles.note} style={{ marginTop: 10 }}>
                            {successNote}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* STEG 2: Åtgärd & tid */}
            <section className={styles.card}>
              <div className={styles.stepBadge}>2</div>
              <h3 className={styles.cardTitle}>Åtgärd & tid</h3>

              <div className={styles.field}>
                <label htmlFor="serviceItem" className={styles.label}>
                  Åtgärd
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <PiWrenchFill />
                  </span>
                  <select
                    id="serviceItem"
                    className={`${styles.input} ${styles.select}`}
                    value={serviceItemId}
                    onChange={(e) =>
                      setServiceItemId(e.target.value ? Number(e.target.value) : "")
                    }
                    required
                  >
                    <option value="">Välj åtgärd…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <span className={styles.inputChevron}>
                    <FiChevronDown />
                  </span>
                </div>
              </div>

              {serviceItemId && (
                <>
                  <div className={styles.inlineGrid}>
                    <div className={styles.field}>
                      <label className={styles.label}>Uppskattad tid (min)</label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>
                          <FiClock />
                        </span>
                        <input
                          type="number"
                          min={5}
                          value={durationMin}
                          onChange={(e) =>
                            setDurationMin(Math.max(5, Number(e.target.value || 0)))
                          }
                          className={styles.input}
                          aria-label="Justera varaktighet"
                        />
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="preferUser" className={styles.label}>
                        Önskad mekaniker
                      </label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>
                          <FiUser />
                        </span>
                        <select
                          id="preferUser"
                          className={`${styles.input} ${styles.select}`}
                          value={preferUserId}
                          onChange={(e) =>
                            setPreferUserId(e.target.value ? Number(e.target.value) : "")
                          }
                        >
                          <option value="">Ingen specifik</option>
                          {employees.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username} ({u.role})
                            </option>
                          ))}
                        </select>
                        <span className={styles.inputChevron}>
                          <FiChevronDown />
                        </span>
                      </div>
                    </div>
                  </div>

                  {chosenItem && (
                    <div className={styles.field}>
                      <PriceSection
                        item={chosenItem}
                        durationMin={durationMin}
                        config={priceConfig}
                        onChange={setPriceConfig}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Datum/tid-läge */}
              <div className={styles.field}>
                <div className={styles.segment}>
                  <button
                      type="button"
                      className={`${styles.segmentBtn} ${dateMode === "latest" ? styles.segmentBtnActive : ""}`}
                      onClick={() => {
                        setDateMode("latest");
                        // Nolla både datetime-fält och heldags-fält
                        if (earliestFrom) setEarliestFrom("");
                        if (latestEnd) setLatestEnd("");
                        if (rangeStartDate) setRangeStartDate("");
                        if (rangeEndDate) setRangeEndDate("");
                      }}
                    >
                      <FiCheckCircle className={styles.segmentIcon} />
                      Senast möjliga
                    </button>
                  <button
                  type="button"
                  className={`${styles.segmentBtn} ${dateMode === "range" ? styles.segmentBtnActive : ""}`}
                  onClick={() => {
                    setDateMode("range");
                    // Nolla datetime-fält som inte längre används i "range"
                    if (earliestFrom) setEarliestFrom("");
                    if (latestEnd) setLatestEnd("");
                  }}
                >
                  <FiCalendar className={styles.segmentIcon} />
                  Specifikt intervall
                </button>
                </div>

                  <div className={styles.field}>
                  <label className={styles.label}>
                    <input
                      type="checkbox"
                      checked={allowFragmentedParts}
                      onChange={(e) => setAllowFragmentedParts(e.target.checked)}
                    />
                    Tillåt fragmentering
                  </label>
                </div>

                {dateMode === "range" && (
                  <div className={styles.inlineGrid}>
                    <div className={styles.field}>
                      <label htmlFor="rangeStart" className={styles.label}>
                        Första dag (heldag)
                      </label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>
                          <FiCalendar />
                        </span>
                        <input
                          id="rangeStart"
                          className={styles.input}
                          type="date"
                          value={rangeStartDate}
                          onChange={(e) => setRangeStartDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="rangeEnd" className={styles.label}>
                        Sista dag (heldag)
                      </label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>
                          <FiCalendar />
                        </span>
                        <input
                          id="rangeEnd"
                          className={styles.input}
                          type="date"
                          value={rangeEndDate}
                          onChange={(e) => setRangeEndDate(e.target.value)}
                          min={rangeStartDate || undefined}
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className={styles.actionRow}>
                <div className={styles.numWrap}>
                  <label htmlFor="numProps" className={styles.smallLabel}>
                    Antal förslag
                  </label>
                  <input
                    id="numProps"
                    className={styles.numInput}
                    type="number"
                    min={1}
                    max={10}
                    value={numProposals}
                    onChange={(e) =>
                      setNumProposals(Number(e.target.value || 3))
                    }
                  />
                </div>

                <div className={styles.buttonsRight}>
                  <button
                    type="submit"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    <FiSearch />
                  </button>
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className={`${styles.btn} ${styles.btnGhost}`}
                    >
                      Avbryt
                    </button>
                  )}
                </div>
              </div>
            </section>
          </fieldset>
        </form>

        {/* Error */}
        {error && (
          <div role="alert" className={styles.alert}>
            <FiXCircle style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* STEG 3: Förslag & bokning */}
        {!!proposals.length && (
          <section className={styles.card}>
            <div className={styles.stepBadge}>3</div>
            <h3 className={styles.cardTitle}>Förslag</h3>

            {/* NYTT: den separerade tabellen som även visar rekommenderad mek */}
            <BookingProposition
              proposals={proposals}
              employees={employees}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              fmt={fmt}
            />

            {/* Titel & beskrivning */}
            <div className={styles.inlineGrid}>
              <div className={styles.field}>
                <label htmlFor="title" className={styles.label}>
                  Titel
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <FiEdit3 />
                  </span>
                  <input
                    id="title"
                    className={styles.input}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titel på bokningen"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="desc" className={styles.label}>
                  Beskrivning (valfritt)
                </label>
                <textarea
                  id="desc"
                  className={styles.commentBox}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ev. noteringar"
                  rows={3}
                />
              </div>
            </div>

            {/* Buffertar + sammanfattning */}

              <div className={styles.field}>
                <label htmlFor="bufa" className={styles.label}>
                  Buffer efter (min)
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <FiClock />
                  </span>
                  <input
                    id="bufa"
                    className={styles.input}
                    type="number"
                    min={0}
                    value={bufferAfter}
                    onChange={(e) =>
                      setBufferAfter(Number(e.target.value || 0))
                    }
                  />
                </div>
              </div>

            {selectedProposal && (
              <div className={styles.summary}>
                Start: <strong>{fmt(selectedProposal.start_at)}</strong>
                &nbsp;•&nbsp; Varaktighet: <strong>{durationMin} min</strong>
                &nbsp;•&nbsp; Slut:{" "}
                <strong>{fmt(selectedProposal?.end_at || "")}</strong>
                {selectedProposal?.parts?.length > 1 && (
                  <div className={styles.muted}>
                    Delintervall:{" "}
                    {selectedProposal.parts
                      .map((p) => `${fmt(p.start_at)}–${fmt(p.end_at)}`)
                      .join(" + ")}
                  </div>
                )}
              </div>
            )}

            <div className={styles.buttonsRight}>
              <button
                type="button"
                onClick={onBook}
                disabled={selectedIndex == null || loading}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                Boka vald tid
              </button>
            </div>
          </section>
        )}

        {/* Tomt resultat */}
        {!proposals.length && reasonEmpty && (
          <div className={styles.note}>{reasonEmpty}</div>
        )}

        {/* Modal: bekräfta bil */}
        <Modal
          open={!!previewCar}
          onClose={() => setPreviewCar(null)}
          title="Bekräfta vald bil"
          footer={
            <>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onConfirmPreview}
              >
                Bekräfta
              </button>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setPreviewCar(null)}
              >
                Avbryt
              </button>
            </>
          }
        >
          {!previewCar ? (
            <div className={styles.muted}>Laddar…</div>
          ) : (
            <div>
              {errorPreview && <div className={styles.alert}>{errorPreview}</div>}
              <div className={styles.cardTitle} style={{ marginBottom: 6 }}>
                Bilinformation
              </div>
              <div className={styles.inlineGrid}>
                <div>
                  <strong>Reg.nr:</strong> {previewCar.registration_number}
                </div>
                {previewCar.brand && (
                  <div>
                    <strong>Märke:</strong> {previewCar.brand}
                  </div>
                )}
                {previewCar.model_year && (
                  <div>
                    <strong>Årsmodell:</strong> {previewCar.model_year}
                  </div>
                )}
                {previewCar.model && (
                  <div>
                    <strong>Modell:</strong> {previewCar.model}
                  </div>
                )}
                {previewCar.vin && (
                  <div>
                    <strong>VIN:</strong> {previewCar.vin}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      </div>
    );

};

export default SimpleBookingForm;
