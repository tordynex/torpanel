// src/pages/booking/hitta-verkstad.tsx
import React, { useEffect, useMemo, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout.tsx";
import styles from "./css/Hitta-Verkstad.module.css";
import { fetchWorkshops, type Workshop } from "@/services/workshopService";
import { FiMapPin, FiClock, FiAlertCircle, FiSearch, FiCheckCircle } from "react-icons/fi";
import { useNavigate, useLocation } from "react-router-dom";
import { createCustomer, type CustomerCreateWithLink } from "@/services/crmService";

// ---- Helpers & storage keys ----
const STEP1_KEY = "autonexo.booking.step1";
const STEP2_KEY = "autonexo.booking.step2";

const getQueryParam = (search: string, key: string) => {
  const qs = new URLSearchParams(search);
  return qs.get(key);
};

const formatOpening = (raw?: string) => (raw ? raw.trim() : "Öppettider saknas");

// ---- Component ----
export default function HittaVerkstadPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Hooks ska vara INUTI komponenten
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // carId från querystring (ska komma från steg 1)
  const carId = useMemo(() => {
    const v = getQueryParam(location.search, "carId");
    return v ? Number(v) : undefined;
  }, [location.search]);

  // Local state
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  // Hämta ev. tidigare val + steg 1-data
  useEffect(() => {
    try {
      const raw2 = sessionStorage.getItem(STEP2_KEY);
      if (raw2) {
        const data2 = JSON.parse(raw2);
        if (data2?.workshopId) setSelectedId(Number(data2.workshopId));
      }
      const raw1 = sessionStorage.getItem(STEP1_KEY);
      if (!raw1 || !carId) {
        // navigate("/boka/registreringsnummer");
      }
    } catch {}
  }, [navigate, carId]);

  // Hämta verkstäder
  useEffect(() => {
    let mounted = true;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const list = await fetchWorkshops();
        if (mounted) setWorkshops(list ?? []);
      } catch (e: any) {
        if (mounted) setError("Kunde inte hämta verkstäder just nu. Försök igen strax.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Filtrering
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return workshops;
    return workshops.filter((w) => {
      const hay = `${w.name} ${w.city} ${w.street_address}`.toLowerCase();
      return hay.includes(q);
    });
  }, [workshops, filter]);

  const canProceed = !!selectedId && !saving;

  const normEmail = (s?: string) => s?.trim().toLowerCase() || undefined;
  const normPhone = (s?: string) => s?.replace(/\s|-/g, "") || undefined;

  const saveAndGoNext = async () => {
    console.log("onNext fired")
    if (!selectedId || saving) return;

    setSaveError(null);
    setSaving(true);
    try {
      const step1 = JSON.parse(sessionStorage.getItem(STEP1_KEY) || "null");
      if (!step1?.car?.id || !step1?.reg) {
        setSaveError("Saknar fordonsuppgifter från steg 1. Gå tillbaka och fyll i bilen först.");
        setSaving(false);
        return;
      }

      const prev = JSON.parse(sessionStorage.getItem(STEP2_KEY) || "null");
      let customer = prev?.customer && prev.workshopId === selectedId ? prev.customer : null;

      if (!customer) {
        const payload: CustomerCreateWithLink = {
          workshop_id: selectedId,
          first_name: step1.contact?.firstName || undefined,
          last_name:  step1.contact?.lastName  || undefined,
          email:       normEmail(step1.contact?.email),
          phone:       normPhone(step1.contact?.phone),
          car_id:      step1.car.id,
          registration_number: step1.reg,
          set_primary: true,
        };
        // 👇 Lägg gärna kvar denna för felsökning
        // console.log("createCustomer payload", payload);
        customer = await createCustomer(payload);
      }

      sessionStorage.setItem(
        STEP2_KEY,
        JSON.stringify({ workshopId: selectedId, customer })
      );

      const qs = new URLSearchParams();
      qs.set("workshopId", String(selectedId));
      qs.set("carId", String(step1.car.id));
      qs.set("customerId", String(customer.id));

      navigate(`/boka/valj-tjanst?${qs.toString()}`);
    } catch (e: any) {
      const apiMsg = e?.response?.data?.detail || e?.message || "Kunde inte skapa/koppla kund.";
      setSaveError(apiMsg);
    } finally {
      setSaving(false);
    }
  };

  // ✅ Den här saknades men användes
  const handleStepChange = (next: 1 | 2 | 3 | 4) => {
    if (next === 1) navigate("/boka");
    if (next === 3 && canProceed) saveAndGoNext();
  };

  return (
    <BookingLayout
      step={2}
      onStepChange={handleStepChange}
      canProceed={canProceed}
      onPrev={() => navigate("/boka")}
      onNext={saveAndGoNext}
      headerActions={
        <a className={styles.helpLink} href="#" onClick={(e) => e.preventDefault()}>
          Behöver du hjälp?
        </a>
      }
    >
      {/* Statusfält för sparning/fel */}
      {saving && <div className={styles.info}>Kopplar kund…</div>}
      {saveError && (
        <div className={styles.alert} role="alert">
          <FiAlertCircle aria-hidden /> {saveError}
        </div>
      )}

      {/* Sök/filterfält */}
      <div className={styles.filterRow}>
        <label htmlFor="filter" className={styles.filterLabel}>
          <FiSearch aria-hidden /> Filtrera
        </label>
        <input
          id="filter"
          className={styles.filterInput}
          placeholder="Sök efter ort eller verkstad…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Status */}
      {loading && <div className={styles.info}>Hämtar verkstäder…</div>}
      {error && (
        <div className={styles.alert} role="alert">
          <FiAlertCircle aria-hidden /> {error}
        </div>
      )}

      {/* Lista */}
      {!loading && !error && (
        <div className={styles.listCard}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>Inga verkstäder matchar din sökning.</div>
          ) : (
            <ul className={styles.workshopList} role="list">
              {filtered.map((w) => {
                const isSelected = selectedId === w.id;
                return (
                  <li
                    key={w.id}
                    className={[
                      styles.workshopItem,
                      isSelected ? styles.workshopItemSelected : ""
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className={styles.workshopBtn}
                      onClick={() => setSelectedId(w.id)}
                      aria-pressed={isSelected}
                    >
                      <div className={styles.workshopHeader}>
                        <div className={styles.workshopTitle}>
                          {isSelected ? <FiCheckCircle aria-hidden /> : <FiMapPin aria-hidden />}
                          <span>{w.name}</span>
                        </div>
                        {isSelected && <span className={styles.selectedBadge}>Vald</span>}
                      </div>

                      <div className={styles.workshopMeta}>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>Adress</span>
                          <span className={styles.metaValue}>
                            {w.street_address}, {w.postal_code} {w.city}
                          </span>
                        </div>
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>
                            <FiClock aria-hidden /> Öppettider
                          </span>
                          <span className={styles.metaValue}>{formatOpening(w.opening_hours)}</span>
                        </div>
                      </div>

                      <div className={styles.radioWrap} aria-hidden>
                        <input
                          type="radio"
                          name="workshop"
                          checked={isSelected}
                          onChange={() => setSelectedId(w.id)}
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

      <p className={styles.note}>
        Välj en verkstad och klicka på <strong>Nästa</strong> för att gå vidare till tjänster.
      </p>
    </BookingLayout>
  );
}
