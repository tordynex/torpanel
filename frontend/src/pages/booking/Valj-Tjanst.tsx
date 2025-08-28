import React, { useEffect, useMemo, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout.tsx";
import styles from "./css/Valj-Tjanst.module.css";
import {
  listServiceItemsForWorkshop,
  type WorkshopServiceItem,
  type ListParams,
} from "@/services/workshopserviceitemService";
import { FiAlertCircle, FiSearch, FiClock, FiTag, FiCheckCircle } from "react-icons/fi";
import { useNavigate, useLocation } from "react-router-dom";

// ---- Storage keys ----
const STEP2_KEY = "autonexo.booking.step2";
const STEP3_KEY = "autonexo.booking.step3";

// ---- Helpers ----
const getQueryParam = (search: string, key: string) => {
  const qs = new URLSearchParams(search);
  return qs.get(key);
};

const formatSEK = (ore?: number | null) => {
  if (ore == null) return "–";
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(
    ore / 100
  );
};

// inkl moms
const grossFromNetOre = (netOre?: number | null, vatPercent?: number | null) => {
  if (netOre == null) return null;
  const vat = typeof vatPercent === "number" ? vatPercent : 0;
  const gross = Math.round(netOre * (1 + vat / 100));
  return gross;
};

const vcLabel = (vc: string | null) => {
  if (vc == null || vc === "all") return "Alla fordon";
  return vc.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

const priceBadge = (item: WorkshopServiceItem) => {
  // request-only → visa tydligt att priset lämnas efter kontakt
  // OBS: vi använder optional chaining eftersom äldre poster kan sakna fältet i FE-typ
  // (backend skickar fältet).
  // @ts-expect-error - request_only finns i backend schema
  if (item?.request_only) return "Förfrågan";

  // Pris inkl. moms
  if (item.price_type === "fixed") {
    const gross = grossFromNetOre(item.fixed_price_ore ?? null, (item as any)?.vat_percent ?? null);
    return gross == null ? "Pris okänt" : formatSEK(gross);
  }
  if (item.price_type === "hourly") {
    const gross = grossFromNetOre(item.hourly_rate_ore ?? null, (item as any)?.vat_percent ?? null);
    return gross == null ? "Pris okänt" : `${formatSEK(gross)}/h`;
  }
  return "Pris okänt";
};

const estimateDuration = (min?: number | null) => {
  if (!min) return "Tid ej angiven";
  return `${min} min`;
};

// ---- Component ----
export default function ValjTjanstPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const carId = useMemo(() => {
    const v = getQueryParam(location.search, "carId");
    return v ? Number(v) : undefined;
  }, [location.search]);

  const workshopId = useMemo(() => {
    const v = getQueryParam(location.search, "workshopId");
    return v ? Number(v) : undefined;
  }, [location.search]);

  // State
  const [items, setItems] = useState<WorkshopServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [q, setQ] = useState("");
  const [vehicleClassFilter, setVehicleClassFilter] = useState<string>(""); // "" = alla
  const [onlyActive, setOnlyActive] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Läs tidigare val
  useEffect(() => {
    try {
      const raw2 = sessionStorage.getItem(STEP2_KEY);
      if (!raw2 || !workshopId) {
        // navigate("/boka/hitta-verkstad" + (carId ? `?carId=${carId}` : ""));
      }
      const raw3 = sessionStorage.getItem(STEP3_KEY);
      if (raw3) {
        const data3 = JSON.parse(raw3);
        if (Array.isArray(data3?.serviceIds)) {
          setSelectedIds(data3.serviceIds.map((n: any) => Number(n)).filter(Boolean));
        }
      }
    } catch {}
  }, [navigate, workshopId, carId]);

  // Hämta service items
  useEffect(() => {
    if (!workshopId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params: ListParams = {};
        if (q.trim()) params.q = q.trim();
        if (onlyActive) params.active = true;
        if (vehicleClassFilter) params.vehicle_class = vehicleClassFilter as any;

        const list = await listServiceItemsForWorkshop(workshopId, params);
        if (mounted) setItems(list ?? []);
      } catch (e) {
        if (mounted) setError("Kunde inte hämta tjänster just nu. Försök igen strax.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [workshopId, q, onlyActive, vehicleClassFilter]);

  // Lokal filtrering (just nu förlitar vi oss på serverfilter)
  const filtered = useMemo(() => items, [items]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canProceed = selectedIds.length > 0;

  // Summering för pris inkl. moms
    const totals = useMemo(() => {
    const selected = filtered.filter((i) => selectedIds.includes(i.id));
    // @ts-expect-error - request_only finns i backend schema
    const hasRequestOnly = selected.some((i) => i?.request_only);

    const fixedGrossSumOre = selected.reduce((acc, i) => {
      if (i.price_type === "fixed" && i.fixed_price_ore != null) {
        const g = grossFromNetOre(i.fixed_price_ore, (i as any)?.vat_percent ?? null);
        return acc + (g ?? 0);
      }
      return acc;
    }, 0);

    const hasHourly = selected.some((i) => i.price_type === "hourly");

    const nonRequestCount = selected.filter((i) => !i?.request_only).length;

    return {
      fixedGrossSumOre,
      hasHourly,
      count: selected.length,
      hasRequestOnly,
      nonRequestCount,
    };
  }, [filtered, selectedIds]);

  const saveAndGoNext = () => {
      if (!canProceed || !workshopId) return;

      // Bygg metadata om valda tjänster så Sammanfattning kan räkna tid OCH pris ex moms
      const selected = filtered.filter((i) => selectedIds.includes(i.id));
      const services = selected.map((i) => ({
        id: i.id,
        name: i.name,
        request_only: !!(i as any)?.request_only,
        default_duration_min:
          typeof (i as any)?.default_duration_min === "number"
            ? (i as any).default_duration_min
            : null,
        // prisfält (netto/ex moms) + moms
        price_type: i.price_type,                          // "fixed" | "hourly"
        fixed_price_ore: i.fixed_price_ore ?? null,        // netto/ex moms från backend
        hourly_rate_ore: i.hourly_rate_ore ?? null,        // netto/ex moms från backend
        vat_percent: (i as any)?.vat_percent ?? null,      // t.ex. 25
      }));

      try {
        sessionStorage.setItem(
          STEP3_KEY,
          JSON.stringify({
            serviceIds: selectedIds,
            services, // <-- komplett meta inkl. pris (ex moms)
          })
        );
      } catch {}

      const qs = new URLSearchParams();
      if (carId) qs.set("carId", String(carId));
      qs.set("workshopId", String(workshopId));
      selectedIds.forEach((id) => qs.append("serviceId", String(id)));

      navigate(`/boka/sammanfattning?${qs.toString()}`);
    };


  const handleStepChange = (next: 1 | 2 | 3 | 4) => {
    if (next === 2 && workshopId) {
      const qs = new URLSearchParams();
      if (carId) qs.set("carId", String(carId));
      navigate(`/boka/hitta-verkstad?${qs.toString()}`);
    }
    if (next === 4 && canProceed) {
      saveAndGoNext();
    }
  };

  return (
      <BookingLayout
        step={3}
        onStepChange={handleStepChange}
        canProceed={canProceed}
        onPrev={() => {
          const qs = new URLSearchParams();
          if (carId) qs.set("carId", String(carId));
          navigate(`/boka/hitta-verkstad?${qs.toString()}`);
        }}
        onNext={saveAndGoNext}
        headerActions={
          <a className={styles.helpLink} href="#" onClick={(e) => e.preventDefault()}>
            Behöver du hjälp?
          </a>
        }
      >
        {/* Filterrad */}
        <form
          className={styles.filters}
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtrera tjänster"
        >
          <div className={styles.filterGroup}>
            <label htmlFor="q" className={styles.filterLabel}>
              <FiSearch aria-hidden /> Sök tjänst
            </label>
            <input
              id="q"
              className={styles.input}
              type="search"
              inputMode="search"
              placeholder="T.ex. Service, Däckbyte, Felsökning…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
            />
          </div>

        </form>

        {/* Status */}
        {loading && (
          <div className={styles.info} aria-live="polite" aria-busy="true">
            Hämtar tjänster…
          </div>
        )}
        {error && (
          <div className={styles.alert} role="alert" aria-live="assertive">
            <FiAlertCircle aria-hidden /> {error}
          </div>
        )}

        {/* Lista */}
        {!loading && !error && (
          <div className={styles.card}>
            {filtered.length === 0 ? (
              <div className={styles.empty} aria-live="polite">
                Inga tjänster hittades.
              </div>
            ) : (
              <ul className={styles.itemList} role="list">
                {filtered.map((it) => {
                  const selected = selectedIds.includes(it.id);
                  // @ts-expect-error - request_only finns i backend schema
                  const isRequest = it?.request_only === true;
                  return (
                    <li
                      key={it.id}
                      className={[
                        styles.item,
                        selected ? styles.itemSelected : "",
                        !it.is_active ? styles.itemInactive : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className={styles.itemBtn}
                        onClick={() => toggleSelect(it.id)}
                        aria-pressed={selected}
                        aria-label={`${it.name}, ${priceBadge(it)}${
                          !it.is_active ? ", Inaktiv" : ""
                        }`}
                      >
                        <div className={styles.itemHeader}>
                          <div className={styles.itemTitle}>
                            {selected ? <FiCheckCircle aria-hidden /> : <FiTag aria-hidden />}
                            <span>{it.name}</span>
                          </div>
                          <div className={styles.priceBadge}>{priceBadge(it)}</div>
                        </div>

                        {it.description && (
                          <p className={styles.itemDesc}>{it.description}</p>
                        )}

                        <div className={styles.itemMeta}>
                          <span className={styles.metaPill}>
                            <FiClock aria-hidden />{" "}
                            {estimateDuration((it as any)?.default_duration_min)}
                          </span>
                          <span className={styles.metaPill}>
                            {vcLabel((it as any)?.vehicle_class ?? null)}
                          </span>
                          {/* Badge för request‑only */}
                          {isRequest && <span className={styles.metaPill}>Förfrågan</span>}
                          {!it.is_active && (
                            <span className={styles.metaPillMuted}>Inaktiv</span>
                          )}
                        </div>

                        <div className={styles.checkWrap} aria-hidden>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelect(it.id)}
                            tabIndex={-1}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Summering */}
        <div className={styles.summary} aria-live="polite">
          <div>
            Valda tjänster: <strong>{totals.count}</strong>
          </div>
          <div className={styles.summaryRight}>
            {totals.fixedGrossSumOre > 0 && (
              <span className={styles.summaryPill}>
                Fastpris inkl. moms: <strong>{formatSEK(totals.fixedGrossSumOre)}</strong>
              </span>
            )}
            {totals.hasHourly && (
              <span className={styles.summaryHint}>
                * Timpriser visas inkl. moms när du väljer tjänsten.
              </span>
            )}
          </div>
        </div>

        {/* Hint om förfrågan */}
        {/* @ts-expect-error - hasRequestOnly är beräknad */}
        {totals.hasRequestOnly && (
          <div className={styles.info} aria-live="polite">
            Minst en vald tjänst är en <strong>förfrågan</strong>. I nästa steg skickas din
            förfrågan till verkstaden i stället för att boka en tid direkt.
          </div>
        )}

        <p className={styles.note}>
          Välj en eller flera tjänster och klicka på <strong>Nästa</strong> för att gå till
          översikten.
        </p>
      </BookingLayout>
    );

}
