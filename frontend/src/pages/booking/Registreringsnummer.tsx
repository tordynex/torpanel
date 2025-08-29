import React, { useEffect, useMemo, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout.tsx";
import {
  FiSearch,
  FiCheckCircle,
  FiAlertCircle,
  FiPlusCircle,
  FiUser,
  FiMail,
  FiPhone,
  FiInfo,
} from "react-icons/fi";
import styles from "./css/Registreringsnummer.module.css";

import {
  fetchCarByReg,
  createCar,
  type Car,
  type CarCreate,
} from "@/services/carService";
import allMakes from "@/utils/cars";
import { useNavigate } from "react-router-dom";

// CRM – följ samma logik som i SimpleBookingForm: createCustomer(set_primary: true, car_id, registration_number)
import {
  createCustomer,
  type CustomerCreateWithLink,
} from "@/services/crmService";

// ---- Helpers ----
const normalizeReg = (v: string) =>
  v.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9ÅÄÖ]/gi, "").slice(0, 10);

// +46-normalisering för svenska nummer
const normalizePhoneSE = (raw: string) => {
  if (!raw) return "";

  // Ta bort mellanslag, bindestreck, parenteser etc – behåll ev. ledande +
  const cleaned = raw.replace(/[^\d+]/g, "");

  // Om annat landsnummer än +46: låt vara (ändra detta om du vill *tvinga* +46)
  if (cleaned.startsWith("+") && !cleaned.startsWith("+46")) {
    return cleaned;
  }

  // Fall 1: redan +46 – ta bort ledande nollor efter landskoden
  if (cleaned.startsWith("+46")) {
    const rest = cleaned.slice(3).replace(/^0+/, "");
    return "+46" + rest;
  }

  // Fall 2: börjar med 0 (svenskt inrikesformat), byt ut mot +46
  if (cleaned.startsWith("0")) {
    const withoutZero = cleaned.replace(/^0+/, "");
    return "+46" + withoutZero;
  }

  // Fall 3: bara siffror utan prefix – anta svenskt nummer
  if (/^\d+$/.test(cleaned)) {
    return "+46" + cleaned.replace(/^0+/, "");
  }

  // Annars: returnera som det är
  return cleaned;
};

const currentYear = new Date().getFullYear();
const STEP1_KEY = "autonexo.booking.step1";

// Läs workshop_id från ENV (krävs av CRM API)
const DEFAULT_WORKSHOP_ID =
  Number(import.meta.env.VITE_DEFAULT_WORKSHOP_ID ?? import.meta.env.VITE_WORKSHOP_ID ?? 0);

// Data we persist for next steps (MVP: sessionStorage)
const saveStep1 = (data: any) => {
  try {
    sessionStorage.setItem(STEP1_KEY, JSON.stringify(data));
  } catch {}
};

export default function RegistreringsnummerPage() {
  const navigate = useNavigate();

  // Step state
  const [reg, setReg] = useState("");
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create-car form (when not found)
  const [brand, setBrand] = useState("");
  const [modelYear, setModelYear] = useState<number | "">("");

  // Contact details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Persist/saving state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Validation
  const regValid = useMemo(() => normalizeReg(reg).length >= 3, [reg]);
  const emailOk = useMemo(() => !email || /.+@.+\..+/.test(email), [email]);
  const normalizedPhone = useMemo(() => normalizePhoneSE(phone), [phone]);
    const phoneOk = useMemo(() => {
      if (!phone) return true;          // tomt är ok (eftersom e-post också kan anges)
      // enkelt rimlighetstest: ska börja med + och vara minst 8–10 tecken
      return /^\+\d{8,15}$/.test(normalizedPhone);
    }, [phone, normalizedPhone]);
  const hasContact = useMemo(() => {
    const hasOne = (email && emailOk) || (phone && phoneOk);
    return hasOne && emailOk && phoneOk;
  }, [email, phone, emailOk, phoneOk]);

  const canProceed = regValid && !!car && hasContact && !saving;

  // Load from session if user navigates back
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STEP1_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.reg) setReg(data.reg);
        if (data?.car) setCar(data.car);
        if (data?.contact) {
          setFirstName(data.contact.firstName || "");
          setLastName(data.contact.lastName || "");
          setEmail(data.contact.email || "");
          setPhone(data.contact.phone || "");
        }
      }
    } catch {}
  }, []);

  const doSearch = async () => {
    setError(null);
    const q = normalizeReg(reg);
    if (!q) return;
    setLoading(true);
    setCar(null);
    try {
      const found = await fetchCarByReg(q);
      setCar(found);
    } catch (err: any) {
      setCar(null);
      if (err?.response?.status === 404) {
        setError("Ingen bil hittades. Lägg till din bil nedan.");
      } else {
        setError("Kunde inte hämta bil just nu. Försök igen strax.");
      }
    } finally {
      setLoading(false);
    }
  };

  const doCreateCar = async () => {
    setError(null);
    const q = normalizeReg(reg);
    if (!q) return;
    if (!brand || !modelYear) {
      setError("Ange bilmärke och årsmodell.");
      return;
    }
    setLoading(true);
    try {
      const payload: CarCreate = {
        registration_number: q,
        brand,
        model_year: Number(modelYear),
      };
      const created = await createCar(payload);
      setCar(created);
    } catch (err: any) {
      setError("Kunde inte skapa bil. Kontrollera uppgifterna och försök igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
      if (!car?.id) return;
      setSaving(true);
      setSaveError(null);
      try {
        const regNr = normalizeReg(reg);
        const phoneForSave = normalizePhoneSE(phone); // <= viktigt

        saveStep1({
          reg: regNr,
          car,
          contact: { firstName, lastName, email, phone: phoneForSave },
        });

        navigate(`/boka/hitta-verkstad?carId=${encodeURIComponent(String(car.id))}`);
      } catch (e) {
        setSaveError("Kunde inte förbereda nästa steg. Försök igen.");
      } finally {
        setSaving(false);
      }
    };


  return (
      <BookingLayout
        step={1}
        onStepChange={() => {}}
        canProceed={canProceed}
        onNext={handleNext}
        headerActions={
          <a className={styles.helpLink} href="#" onClick={(e) => e.preventDefault()}>
            Behöver du hjälp?
          </a>
        }
      >
        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className={styles.heroSub}>
              Ange bil & kontaktuppgifter. Anpassad för mobil.
            </p>
          </div>
          <div className={styles.heroBadge}>
            <FiInfo aria-hidden /> Smidigt • Tryggt • Autonexo
          </div>
        </section>

        {/* GRID */}
        <section className={styles.grid}>
          {/* VÄNSTER – Bil */}
          <div className={styles.col}>
            <div className={`${styles.card} ${styles.cardTall}`}>
              <h3 className={styles.cardTitle}>
                <FiSearch aria-hidden /> Din bil
              </h3>

              {/* Sök regnr */}
              <div className={styles.inputRow}>
                <div className={styles.inputWithIcon}>
                  <span className={styles.inputIcon} aria-hidden>
                    <FiSearch />
                  </span>
                  <input
                    id="reg"
                    className={styles.input}
                    type="search"
                    inputMode="latin"
                    autoCapitalize="characters"
                    enterKeyHint="search"
                    placeholder="ABC123"
                    value={reg}
                    onChange={(e) => setReg(normalizeReg(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doSearch();
                    }}
                  />
                </div>
                <button
                  className={styles.btnPrimary}
                  onClick={doSearch}
                  disabled={!regValid || loading}
                  aria-label="Sök bil"
                >
                  Sök
                </button>
              </div>

              <p className={styles.muted}>
                Vi hämtar din bil om den finns registrerad. Annars kan du lägga till den här.
              </p>

              {/* Status */}
              {loading && <div className={styles.info} role="status">Söker efter bil…</div>}
              {error && (
                <div className={styles.alert} role="alert">
                  <FiAlertCircle aria-hidden /> {error}
                </div>
              )}

              {/* Hittad bil */}
              {car && (
                <div className={styles.foundCard}>
                  <div className={styles.foundHeader}>
                    <div className={styles.carTitle}>
                      <FiCheckCircle aria-hidden /> {car.registration_number}
                    </div>
                    <div className={styles.badge}>Hittad</div>
                  </div>

                  <div className={styles.foundGrid}>
                    <div className={styles.kv}>
                      <span className={styles.k}>Märke</span>
                      <span className={styles.v}>{car.brand || "—"}</span>
                    </div>
                    <div className={styles.kv}>
                      <span className={styles.k}>Årsmodell</span>
                      <span className={styles.v}>{car.model_year ?? "—"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Skapa bil */}
              {!loading && !car && error && (
                <div className={styles.createWrap}>
                  <div className={styles.createHeader}>
                    <h4 className={styles.createTitle}>
                      <FiPlusCircle aria-hidden /> Lägg till din bil
                    </h4>
                  </div>

                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="brand">
                        Märke
                      </label>
                      <select
                        id="brand"
                        className={styles.select}
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                      >
                        <option value="">Välj märke…</option>
                        {allMakes.map((m: string) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="year">
                        Årsmodell
                      </label>
                      <input
                        id="year"
                        className={styles.input}
                        type="number"
                        min={1970}
                        max={currentYear + 1}
                        placeholder="t.ex. 2018"
                        value={modelYear}
                        onChange={(e) =>
                          setModelYear(e.target.value ? Number(e.target.value) : "")
                        }
                      />
                    </div>
                  </div>

                  <div className={styles.actionsRight}>
                    <button className={styles.btnPrimary} onClick={doCreateCar}>
                      Spara bil
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.flexGrow} />
            </div>
          </div>

          {/* HÖGER – Kontakt */}
          <div className={styles.col}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <FiUser aria-hidden /> Dina uppgifter
              </h3>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="first">
                    <FiUser aria-hidden className={styles.labelIcon} /> Förnamn
                  </label>
                  <input
                    id="first"
                    className={styles.input}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Anna"
                    autoComplete="given-name"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="last">
                    <FiUser aria-hidden className={styles.labelIcon} /> Efternamn
                  </label>
                  <input
                    id="last"
                    className={styles.input}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Svensson"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="email">
                    <FiMail aria-hidden className={styles.labelIcon} /> E-post
                  </label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    enterKeyHint="next"
                    className={[
                      styles.input,
                      !emailOk && email ? styles.inputError : "",
                    ].join(" ")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="anna@example.com"
                    autoComplete="email"
                  />
                  <p className={styles.mutedSmall}>
                    Du kan ange e-post eller telefon (minst en krävs).
                  </p>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="phone">
                    <FiPhone aria-hidden className={styles.labelIcon} /> Telefon
                  </label>
                  <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  enterKeyHint="done"
                  className={[
                    styles.input,
                    !phoneOk && phone ? styles.inputError : "",
                  ].join(" ")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhone(normalizedPhone)}   // <= auto-formatering här
                  placeholder="+4670…"
                  autoComplete="tel"
                />
                </div>
              </div>

              {!hasContact && (
                <div className={styles.warnLine}>
                  <FiAlertCircle aria-hidden /> Ange minst en giltig kontaktväg (e-post
                  eller telefon).
                </div>
              )}
            </div>

            {saveError && (
              <div className={styles.alert} role="alert">
                <FiAlertCircle aria-hidden /> {saveError}
              </div>
            )}

            <p className={styles.policy}>
              Genom att gå vidare godkänner du vår{" "}
              <a href="#" onClick={(e) => e.preventDefault()}>
                integritetspolicy
              </a>
              .
            </p>

            {saving && <div className={styles.info}>Sparar kunduppgifter…</div>}
          </div>
        </section>
      </BookingLayout>
    );

}
