import React, { useEffect, useMemo, useState } from "react";
import styles from "./css/MakeBooking.module.css";

import {
  createBooking,
  checkBayAvailability,
  type BayBookingCreate,
  type BayBookingRead,
} from "@/services/baybookingService";

import { fetchAllBays, type WorkshopBayReadSimple } from "@/services/servicebayService";
import {
  fetchWorkshopEmployees,
  type UserSimple,
} from "@/services/workshopService";

import { fetchCarByReg } from "@/services/carService";

import {
  FiX,
  FiClock,
  FiUser,
  FiHash,
  FiTag,
  FiChevronDown,
  FiCalendar,
  FiCheckCircle,
} from "react-icons/fi";
import { MdOutlineDirectionsCarFilled } from "react-icons/md";

type Props = {
  workshopId: number;
  /** Förvald bay från kalendern */
  defaultBayId: number;
  /** Förvald start från kalendern (Date eller ISO/string) */
  defaultStartAt: Date | string;
  /** Förvald slut från kalendern (Date eller ISO/string) */
  defaultEndAt: Date | string;
  onClose: () => void;
  onCreated: (booking: BayBookingRead) => void;
};

/* -------------------------------------------------------
   DATUM-HJÄLPARE (robusta mot undefined/ogiltiga värden)
--------------------------------------------------------*/
const pad = (n: number) => String(n).padStart(2, "0");

/** Lägg till minuter på Date utan att mutera indata. */
const addMinutes = (d: Date, mins: number) => {
  const nd = new Date(d);
  nd.setMinutes(nd.getMinutes() + mins);
  return nd;
};

/** Försök göra Date av Date|string, annars fallback. */
const coerceDate = (v: Date | string | undefined, fallback: Date) => {
  if (!v) return fallback;
  const d = typeof v === "string" ? new Date(v) : v;
  return d instanceof Date && !isNaN(d.getTime()) ? d : fallback;
};

/** För input[type="datetime-local"] – robust formatterare. */
const toLocalInputValue = (d?: Date | string | null): string => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${DD}T${hh}:${mm}`;
};

const krToOre = (val: string): number | null => {
  if (!val) return null;
  const normalized = val.replace(/\s/g, "").replace(",", "."); // ta bort mellanslag, kommatecken -> punkt
  const num = Number(normalized);
  if (!isFinite(num)) return null;
  return Math.round(num * 100);
};

/** Räkna ut nettopris i öre från bruttopris i öre och moms-% */
const grossToNetOre = (grossOre: number | null, vatStr: string): number | null => {
  if (grossOre == null) return null;
  const vat = Number(vatStr);
  if (!isFinite(vat)) return null;
  // net = gross / (1 + VAT/100), avrundat till närmaste öre
  return Math.round(grossOre / (1 + vat / 100));
};

/** Parse "YYYY-MM-DDTHH:MM" (lokal tid) till Date eller null. */
const parseLocalDT = (val: string): Date | null => {
  if (!val) return null;
  const dt = new Date(val);
  return isNaN(dt.getTime()) ? null : dt;
};

/** Diff i hela minuter (b - a). */
const minutesDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

/** ISO med aktuell offset (TIMESTAMPTZ-kompatibel). */
const toOffsetISO = (val?: Date | string): string | undefined => {
  if (!val) return undefined;
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return undefined;
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const II = pad(d.getMinutes());
  const tzOffsetMin = -d.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const offAbs = Math.abs(tzOffsetMin);
  const offH = pad(Math.floor(offAbs / 60));
  const offM = pad(offAbs % 60);
  return `${yyyy}-${MM}-${DD}T${HH}:${II}:00${sign}${offH}:${offM}`;
};

const MakeBooking: React.FC<Props> = ({
  workshopId,
  defaultBayId,
  defaultStartAt,
  defaultEndAt,
  onClose,
  onCreated,
}) => {
  /* -------------------------------------------------------
     LADDA GRUNDDATA
  --------------------------------------------------------*/
  const [bays, setBays] = useState<WorkshopBayReadSimple[]>([]);
  const [employees, setEmployees] = useState<UserSimple[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingBase(true);
      setBaseError(null);
      try {
        const [bayList, employeesList] = await Promise.all([
          fetchAllBays(workshopId),
          fetchWorkshopEmployees(workshopId, ["workshop_employee", "workshop_user"]),
        ]);
        if (!mounted) return;
        setBays(bayList || []);
        setEmployees(employeesList || []);
      } catch (e: any) {
        console.error(e);
        if (mounted) {
          setBaseError(e?.response?.data?.detail ?? "Kunde inte ladda grunddata.");
        }
      } finally {
        if (mounted) setLoadingBase(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [workshopId]);

  /* -------------------------------------------------------
     INITIALT DATUMSTATE (robust mot ogiltiga props)
  --------------------------------------------------------*/
  const initialStart = useMemo(
    () => coerceDate(defaultStartAt, new Date()),
    [defaultStartAt]
  );
  const initialEnd = useMemo(
    () => coerceDate(defaultEndAt, addMinutes(initialStart, 60)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultEndAt, initialStart.getTime()]
  );

  /* -------------------------------------------------------
     FORM-STATE
  --------------------------------------------------------*/
  const [bayId, setBayId] = useState<number | null>(
      Number.isFinite(defaultBayId) ? defaultBayId : null
    );
  const [title, setTitle] = useState<string>("Bokning");
  const [description, setDescription] = useState<string>("");

  const [startLocal, setStartLocal] = useState<string>(() => toLocalInputValue(initialStart));
  const [endLocal, setEndLocal] = useState<string>(() => toLocalInputValue(initialEnd));
  const [durationMin, setDurationMin] = useState<number>(() =>
    Math.max(5, minutesDiff(initialStart, initialEnd))
  );

  const [bufferBefore, setBufferBefore] = useState<number>(0);
  const [bufferAfter, setBufferAfter] = useState<number>(0);

  const [assignedUserId, setAssignedUserId] = useState<number | "">("");

  const [carReg, setCarReg] = useState<string>("");
  const [resolvedCarId, setResolvedCarId] = useState<number | null>(null);
  const [resolvingCar, setResolvingCar] = useState<boolean>(false);
  const [carNote, setCarNote] = useState<string>("");

  const [chainToken, setChainToken] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pris
    const [priceGrossSek, setPriceGrossSek] = useState<string>(""); // pris inkl. moms i kronor, t.ex. "1495"
    const [vatPercent, setVatPercent] = useState<string>("25");     // standard 25%
    const [priceNote, setPriceNote] = useState<string>("");
    const [priceIsCustom, setPriceIsCustom] = useState<boolean>(false);


  /** Visuell badge efter körd koll */
  const [availBadge, setAvailBadge] = useState<{ ok: boolean; reason?: string } | null>(null);

  /* -------------------------------------------------------
     SYNKA NYA PROPS → STATE (om användaren klickar ny slot)
  --------------------------------------------------------*/
  // Behåll att ta emot ny default
    useEffect(() => {
      if (Number.isFinite(defaultBayId)) setBayId(defaultBayId);
    }, [defaultBayId]);

    // När bays laddas: fallback till första om inget giltigt val finns
    useEffect(() => {
      if ((bayId == null || !bays.some(b => b.id === bayId)) && bays.length) {
        setBayId(bays[0].id);
      }
    }, [bays, bayId]);

  useEffect(() => {
    const s = coerceDate(defaultStartAt, new Date());
    const e = coerceDate(defaultEndAt, addMinutes(s, 60));
    setStartLocal(toLocalInputValue(s));
    setEndLocal(toLocalInputValue(e));
    setDurationMin(Math.max(5, minutesDiff(s, e)));
    // Nollställ tidigare tillgänglighetsbadge när tider hoppar
    setAvailBadge(null);
  }, [defaultStartAt, defaultEndAt]);

  /* -------------------------------------------------------
     KOPPLA DURATION ↔ END
  --------------------------------------------------------*/
  // När start eller duration ändras → uppdatera end
  useEffect(() => {
    const s = parseLocalDT(startLocal);
    if (!s) return;
    const newEnd = addMinutes(s, durationMin);
    const asStr = toLocalInputValue(newEnd);
    // Uppdatera endast om strängen faktiskt skiljer sig för att undvika loop
    setEndLocal((prev) => (prev !== asStr ? asStr : prev));
  }, [startLocal, durationMin]);

  // När slut ändras manuellt → räkna om duration
  useEffect(() => {
    const s = parseLocalDT(startLocal);
    const e = parseLocalDT(endLocal);
    if (!s || !e) return;
    const diff = minutesDiff(s, e);
    if (diff > 0 && diff !== durationMin) setDurationMin(diff);
    // Nollställ badge vid manuell ändring
    setAvailBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endLocal]);

  /* -------------------------------------------------------
     HJÄLP: Bay-namn
  --------------------------------------------------------*/
  const bayName = useMemo(() => bays.find((b) => b.id === bayId)?.name ?? "—", [bays, bayId]);

  /* -------------------------------------------------------
     BIL-LOOKUP
  --------------------------------------------------------*/
  const tryResolveCar = async () => {
    const reg = carReg.trim().toUpperCase();
    if (!reg) {
      setResolvedCarId(null);
      setCarNote("");
      return;
    }
    setResolvingCar(true);
    setError(null);
    try {
      const car = await fetchCarByReg(reg);
      if (car?.id) {
        setResolvedCarId(car.id);
        setCarNote(
          `${car.registration_number}${car.brand ? " • " + car.brand : ""}${
            car.model_year ? " (" + car.model_year + ")" : ""
          }`
        );
      } else {
        setResolvedCarId(null);
        setCarNote("Ingen bil hittades – bokar utan kopplad bil.");
      }
    } catch {
      setResolvedCarId(null);
      setCarNote("Ingen bil hittades – bokar utan kopplad bil.");
    } finally {
      setResolvingCar(false);
    }
  };

  /* -------------------------------------------------------
     TILLGÄNGLIGHETSKONTROLL (returvärde istället för race i state)
  --------------------------------------------------------*/
  const runAvailabilityCheck = async (): Promise<{ ok: boolean; reason?: string }> => {
      setError(null);

      if (bayId == null) {
        const reason = "Välj arbetsplats.";
        setAvailBadge({ ok: false, reason });
        return { ok: false, reason };
      }

      const s = parseLocalDT(startLocal);
      const e = parseLocalDT(endLocal);
      if (!s || !e || e <= s) {
        const reason = "Sluttid måste vara efter starttid.";
        setAvailBadge({ ok: false, reason });
        return { ok: false, reason };
      }

      try {
        const res = await checkBayAvailability({
          workshopId,
          bayId, // ← nu garanterat ett nummer
          startAt: toOffsetISO(s)!,
          endAt: toOffsetISO(e)!,
          bufferBeforeMin: bufferBefore,
          bufferAfterMin: bufferAfter,
        });
        const ok = !!res.available;
        const reason = res.reason ?? undefined;
        setAvailBadge({ ok, reason });
        return { ok, reason };
      } catch (e: any) {
        console.error(e);
        const reason = e?.response?.data?.detail ?? "Kunde inte kontrollera tillgänglighet.";
        setAvailBadge({ ok: false, reason });
        return { ok: false, reason };
      }
    };


  /* -------------------------------------------------------
     SUBMIT
  --------------------------------------------------------*/
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const s = parseLocalDT(startLocal);
    const eDate = parseLocalDT(endLocal);
    if (!s || !eDate) {
      setError("Fyll i både start och slut.");
      return;
    }
    if (eDate <= s) {
      setError("Sluttid måste vara efter starttid.");
      return;
    }
    if (!title.trim()) {
      setError("Titel krävs.");
      return;
    }

    // Kör tillgänglighetskoll och använd returvärdet (undvik race på state)
    const { ok, reason } = await runAvailabilityCheck();
    if (!ok) {
      setError(reason || "Tiden verkar upptagen.");
      return;
    }

    // Bil-lookup (icke-blockerande men bra att försöka om reg finns och vi inte redan har id)
    if (carReg.trim() && resolvedCarId === null) {
      await tryResolveCar();
    }

    setSubmitting(true);
    const grossOre = krToOre(priceGrossSek);                   // inkl. moms → öre
    const netOre = grossToNetOre(grossOre, vatPercent);
    try {
      const payload: BayBookingCreate = {
      workshop_id: workshopId,
      bay_id: bayId!, // vi har redan validerat att den finns
      title: title.trim(),
      description: description || undefined,
      start_at: toOffsetISO(s)!,
      end_at: toOffsetISO(eDate)!,
      buffer_before_min: bufferBefore || 0,
      buffer_after_min: bufferAfter || 0,
      status: undefined, // server default BOOKED
      customer_id: undefined, // enkel komponent – inget kundflöde
      car_id: resolvedCarId ?? undefined,
      service_log_id: undefined,
      assigned_user_id: typeof assignedUserId === "number" ? assignedUserId : undefined,
      source: "calendar",

      // ----- NYTT: Pris -----
      price_gross_ore: krToOre(priceGrossSek) ?? null,
      vat_percent: vatPercent !== "" ? Number(vatPercent) : null,
      price_net_ore: netOre,
      price_note: priceNote || null,
      price_is_custom: priceIsCustom,

      // (valfritt fält som du hade sedan innan)
      chain_token: chainToken || undefined,
    };


      const created = await createBooking(payload);
      onCreated(created);
      onClose();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.detail ??
        (typeof err?.message === "string" ? err.message : "Kunde inte skapa bokning.");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------------
     UI: Tillgänglighetsbadge
  --------------------------------------------------------*/
  const AvailabilityBadge = () => {
    if (!availBadge) return null;
    if (availBadge.ok) {
      return (
        <span className={styles.badgeOk} title="Senaste kontrollen visade ledigt">
          <FiCheckCircle /> Ledigt
        </span>
      );
    }
    return (
      <span className={styles.badgeWarn} title={availBadge.reason || "Upptaget"}>
        {availBadge.reason || "Upptaget"}
      </span>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.title}>Ny bokning</h3>
          <p className={styles.subtitle}>
            {bays.length ? (
              <>
                Arbetsplats: <strong>{bayName}</strong>
              </>
            ) : (
              "Hämtar…"
            )}
          </p>
        </div>
        <button className={styles.iconClose} onClick={onClose} aria-label="Stäng">
          <FiX />
        </button>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        {baseError && <div className={styles.alert}>{baseError}</div>}

        {/* Tid & plats */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>Tid & plats</div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="bay">
                Arbetsplats
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiTag />
                </span>
                <select
                  id="bay"
                  className={`${styles.input} ${styles.select}`}
                  value={bayId ?? ""}                                  // ← ändrat
                  onChange={(e) => setBayId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loadingBase}
                >
                  <option value="" disabled>Välj arbetsplats…</option>  {/* ← ny rad */}
                  {bays.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className={styles.inputChevron}>
                  <FiChevronDown />
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="start">
                Start
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiCalendar />
                </span>
                <input
                  id="start"
                  type="datetime-local"
                  className={styles.input}
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="end">
                Slut
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiCalendar />
                </span>
                <input
                  id="end"
                  type="datetime-local"
                  className={styles.input}
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="dur">
                Varaktighet (min)
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiClock />
                </span>
                <input
                  id="dur"
                  type="number"
                  min={5}
                  className={styles.input}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value || 0)))}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="bufb">
                Buffert före (min)
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiClock />
                </span>
                <input
                  id="bufb"
                  type="number"
                  min={0}
                  className={styles.input}
                  value={bufferBefore}
                  onChange={(e) => setBufferBefore(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="bufa">
                Buffert efter (min)
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiClock />
                </span>
                <input
                  id="bufa"
                  type="number"
                  min={0}
                  className={styles.input}
                  value={bufferAfter}
                  onChange={(e) => setBufferAfter(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={`${styles.btnSecondary}`}
              onClick={runAvailabilityCheck}
              disabled={loadingBase}
              title="Snabb krock-kontroll"
            >
              Kontrollera tillgänglighet
            </button>
            <AvailabilityBadge />
          </div>
        </section>

        {/* Grundinfo */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>Grundinfo</div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="title">
                Titel
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiHash />
                </span>
                <input
                  id="title"
                  className={styles.input}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titel på bokningen"
                  required
                />
              </div>
            </div>

            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.label} htmlFor="desc">
                Beskrivning (valfritt)
              </label>
              <textarea
                id="desc"
                className={styles.textarea}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ev. noteringar"
              />
            </div>
          </div>
        </section>

        {/* Bil */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>Bil (valfritt)</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reg">
                Registreringsnummer
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <MdOutlineDirectionsCarFilled />
                </span>
                <input
                  id="reg"
                  className={styles.input}
                  value={carReg}
                  onChange={(e) => setCarReg(e.target.value.toUpperCase())}
                  onBlur={() => {
                    if (carReg.trim()) void tryResolveCar();
                  }}
                  placeholder="ABC123"
                />
              </div>
              {resolvingCar && (
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Söker bil…
                </div>
              )}
              {carNote && !resolvingCar && (
                <div className={styles.note} style={{ marginTop: 6 }}>
                  {carNote}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Resurser & åtgärd */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>Resurser & åtgärd (valfritt)</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="user">
                Tilldelad mekaniker
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <FiUser />
                </span>
                <select
                  id="user"
                  className={`${styles.input} ${styles.select}`}
                  value={assignedUserId}
                  onChange={(e) =>
                    setAssignedUserId(e.target.value ? Number(e.target.value) : "")
                  }
                  disabled={loadingBase}
                >
                  <option value="">Ingen</option>
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
              <div className={styles.muted} style={{ marginTop: 6 }}>
                Inga förslag eller konflikttester här – backend stoppar om användaren är upptagen.
              </div>
            </div>

              {/* Pris */}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="chain">
                Kedje-token (valfritt)
              </label>
              <input
                id="chain"
                className={styles.input}
                value={chainToken}
                onChange={(e) => setChainToken(e.target.value)}
                placeholder="Ange om detta är del i ett större jobb"
              />
            </div>
          </div>
        </section>

                        <section className={styles.card}>
                  <div className={styles.cardTitle}>Pris</div>
                  <div className={styles.grid}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="priceGrossSek">
                        Pris inkl. moms (kr)
                      </label>
                      <div className={styles.inputWrap}>
                        <input
                          id="priceGrossSek"
                          className={styles.input}
                          type="text"
                          inputMode="decimal"
                          placeholder="t.ex. 1495"
                          value={priceGrossSek}
                          onChange={(e) => setPriceGrossSek(e.target.value)}
                        />
                      </div>
                      <div className={styles.muted} style={{ marginTop: 6 }}>
                        Ange i kronor (du kan skriva 1495 eller 1495,00).
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="vatPercent">
                        Moms %
                      </label>
                      <div className={styles.inputWrap}>
                        <input
                          id="vatPercent"
                          className={styles.input}
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={vatPercent}
                          onChange={(e) => setVatPercent(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                      <label className={styles.label} htmlFor="priceNote">
                        Prisnotering (valfritt)
                      </label>
                      <textarea
                        id="priceNote"
                        className={styles.textarea}
                        rows={2}
                        value={priceNote}
                        onChange={(e) => setPriceNote(e.target.value)}
                        placeholder="T.ex. fast pris enligt överenskommelse"
                      />
                    </div>

                    <div className={styles.field} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
                    </div>
                  </div>
                </section>


        {/* felrad */}
        {error && <div className={styles.alert}>{error}</div>}

        {/* actions */}
        <div className={styles.footer}>
          <button type="button" className={`${styles.btnSecondary}`} onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className={styles.btn} disabled={submitting || loadingBase}>
            {submitting ? "Skapar…" : "Skapa bokning"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MakeBooking;
