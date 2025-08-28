import { useEffect, useMemo, useState } from "react"
import { MdAddCircleOutline } from "react-icons/md"
import { GoArrowDownLeft } from "react-icons/go"
import type { Car } from "@/services/carService"
import carService, { fetchCarByReg } from "@/services/carService"
import CreateCarForm from "./CreateCarForm"
import Modal from "@/components/common/Modal"
import styles from "./css/SelectOrCreateCar.module.css"
import crmService, { type Customer } from "@/services/crmService"

interface Props {
  onCarSelected: (car: Car) => void
  /** Krävs för att läsa/sätta kund mot bilen */
  workshopId: number
}

export default function SelectOrCreateCar({ onCarSelected, workshopId }: Props) {
  // ====== Sök / välj / skapa bil (befintlig funktionalitet) ======
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Car[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [prefillReg, setPrefillReg] = useState<string>("")
  const [loading, setLoading] = useState(false)

  // Preview + modal (befintligt)
  const [previewCar, setPreviewCar] = useState<Car | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [errorPreview, setErrorPreview] = useState<string | null>(null)

  // ====== Nytt: aktiv bil-panel "Kund kopplad till bil" ======
  const [activeCar, setActiveCar] = useState<Car | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [primaryCustomer, setPrimaryCustomer] = useState<Customer | null>(null)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [errorCustomers, setErrorCustomers] = useState<string | null>(null)

  // Lägg till / koppla kund (inline-form)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [custFirst, setCustFirst] = useState("")
  const [custLast, setCustLast] = useState("")
  const [custEmail, setCustEmail] = useState("")
  const [custPhone, setCustPhone] = useState("")
  const [custSetPrimary, setCustSetPrimary] = useState(true)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [successNote, setSuccessNote] = useState("")

  const normalizeReg = (s: string) => s.toUpperCase().replace(/\s+/g, "")
  const normalizeEmail = (s: string) => s.trim().toLowerCase()
  const normalizePhone = (s: string) => s.replace(/\s|-/g, "")

  // ====== Sökning (befintligt) ======
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const q = query.trim()
      if (q.length < 2) {
        setMatches([])
        return
      }
      setLoading(true)
      try {
        const all = await carService.fetchAllCars()
        if (cancelled) return
        const qLower = q.toLowerCase()
        const filtered = all.filter((car) =>
          car.registration_number.toLowerCase().includes(qLower)
        )
        setMatches(filtered)
      } catch (err) {
        console.error("Kunde inte hämta bilar", err)
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [query])

  // ====== Hjälpare: ladda kunder för aktiv bil ======
  const refreshCustomers = async (car: Car) => {
    setLoadingCustomers(true)
    setErrorCustomers(null)
    try {
      const [list, primary] = await Promise.all([
        crmService.fetchCarCustomers(car.id, workshopId),
        crmService.fetchPrimaryCustomerForCar(car.id, workshopId).catch(() => null),
      ])
      setCustomers(list || [])
      setPrimaryCustomer(primary || null)
    } catch (e) {
      console.error(e)
      setErrorCustomers("Kunde inte hämta kopplade kunder.")
      setCustomers([])
      setPrimaryCustomer(null)
    } finally {
      setLoadingCustomers(false)
    }
  }

  const openPreviewForCar = (car: Car) => {
    setErrorPreview(null)
    setPreviewCar(car)
    // Nytt: sätt som aktiv bil för kund-panelen
    setActiveCar(car)
    refreshCustomers(car)
  }

  const openPreviewByReg = async (reg: string) => {
    setErrorPreview(null)
    setLoadingPreview(true)
    try {
      const car = await fetchCarByReg(reg.replace(/\s+/g, ""))
      openPreviewForCar(car)
    } catch (e) {
      console.error(e)
      setErrorPreview("Kunde inte hämta bil med det regnumret.")
    } finally {
      setLoadingPreview(false)
    }
  }

  const trimmed = query.trim()
  const canShowAddButton = trimmed.length >= 2 && !loading && matches.length === 0

  // ====== Nytt: Set primary för befintlig kund ======
  const setAsPrimary = async (customerId: number) => {
    if (!activeCar) return
    setLoadingCustomers(true)
    setErrorCustomers(null)
    setSuccessNote("")
    try {
      // Hämta kundens detaljer för att kunna använda createCustomer (dedupe) till att sätta primär-länk
      const cust = await crmService.fetchCustomerById(customerId)
      await crmService.createCustomer({
        workshop_id: cust.workshop_id,
        first_name: cust.first_name || undefined,
        last_name: cust.last_name || undefined,
        email: cust.email || undefined,
        phone: cust.phone || undefined,
        registration_number: activeCar.registration_number,
        set_primary: true,
      })
      await refreshCustomers(activeCar)
      setSuccessNote("Primär kund uppdaterad.")
    } catch (e) {
      console.error(e)
      setErrorCustomers("Kunde inte sätta primär kund.")
    } finally {
      setLoadingCustomers(false)
    }
  }

  // ====== Nytt: Lägg till / koppla kund inline ======
  const canSaveInlineCustomer = useMemo(() => {
    const hasContact =
      (custEmail && custEmail.trim().length > 0) ||
      (custPhone && custPhone.trim().length > 0)
    return !!activeCar && hasContact
  }, [activeCar, custEmail, custPhone])

  const saveInlineCustomer = async () => {
    if (!activeCar) return
    if (!canSaveInlineCustomer) return
    setSavingCustomer(true)
    setErrorCustomers(null)
    setSuccessNote("")
    try {
      await crmService.createCustomer({
        workshop_id: workshopId,
        first_name: custFirst || undefined,
        last_name: custLast || undefined,
        email: custEmail ? normalizeEmail(custEmail) : undefined,
        phone: custPhone ? normalizePhone(custPhone) : undefined,
        registration_number: activeCar.registration_number,
        set_primary: custSetPrimary,
      })
      await refreshCustomers(activeCar)
      setShowAddCustomer(false)
      setCustFirst("")
      setCustLast("")
      setCustEmail("")
      setCustPhone("")
      setCustSetPrimary(true)
      setSuccessNote("Kund kopplad till bilen.")
    } catch (e) {
      console.error(e)
      setErrorCustomers("Kunde inte koppla kund. Kontrollera uppgifterna.")
    } finally {
      setSavingCustomer(false)
    }
  }

  // ====== Bekräfta-val (befintligt) ======
  const onConfirmPreview = () => {
    if (previewCar) {
      onCarSelected(previewCar)
      setPreviewCar(null)
      // behåll activeCar så panelen kan fortsätta användas om komponenten stannar kvar
    }
  }

  if (showCreateForm) {
    return (
      <div className={styles.wrapper}>
        <CreateCarForm
          workshopId={workshopId}
          initialRegistration={prefillReg}
          onCreated={(car) => {
            // När bil skapas kan förälder gå vidare direkt
            onCarSelected(car)
            // Nytt: sätt aktiv bil så panelen finns om man stannar kvar här
            setActiveCar(car)
            refreshCustomers(car)
            setShowCreateForm(false)
            setPrefillReg("")
          }}
          onCancel={() => {
            setShowCreateForm(false)
            setPrefillReg("")
          }}
        />
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* ======= Sök / välj bil ======= */}
      <div className={styles.title}>Sök bil (registreringsnummer)</div>

      <input
        className={styles.input}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim().length >= 2) {
            openPreviewByReg(query.trim())
          }
        }}
        placeholder="t.ex. ABC123"
        aria-label="Sök regnummer"
      />

      {query.trim().length < 2 && (
        <div className={styles.info}>Skriv minst två tecken för att börja söka.</div>
      )}

      {matches.length > 0 && (
        <div className={styles.resultBox} role="list">
          {loading ? (
            <div className={styles.info}>Laddar…</div>
          ) : (
            matches.map((car) => (
              <div
                key={car.id}
                role="listitem"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                }}
              >
                <div>
                  <strong>{car.registration_number}</strong>
                  {car.brand ? ` – ${car.brand}` : ""}{" "}
                  {car.model_year ? `(${car.model_year})` : ""}
                </div>
                <button
                  className={styles.selectBtn}
                  onClick={() => openPreviewForCar(car)}
                >
                  Välj <GoArrowDownLeft />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {canShowAddButton && (
        <button
          className={styles.addBtn}
          onClick={() => {
            setPrefillReg(normalizeReg(trimmed))
            setShowCreateForm(true)
          }}
          disabled={loadingPreview}
        >
          <MdAddCircleOutline size={18} style={{ verticalAlign: "text-bottom" }} />
          &nbsp;Lägg till bil
        </button>
      )}

      {/* ======= NYTT: Kund kopplad till bil (under hitta/skapa) ======= */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className={styles.title} style={{ fontSize: "1rem" }}>
          Kund kopplad till bil
        </div>

        {!activeCar ? (
          <div className={styles.info}>Välj eller skapa en bil ovan först.</div>
        ) : (
          <>
            {/* Aktiv bil-info light */}
            <div
              className={styles.selectedCar}
              style={{
                marginTop: 8,
                padding: "8px 10px",
                border: "1px dashed var(--border)",
                borderRadius: 6,
              }}
            >
              <div className={styles.selectedCarBody}>
                <div>
                  <strong>Reg.nr:</strong> {activeCar.registration_number}{" "}
                  {activeCar.brand ? `– ${activeCar.brand}` : ""}{" "}
                  {activeCar.model_year ? `(${activeCar.model_year})` : ""}
                </div>
              </div>
            </div>

            {/* Primär kund */}
            <div style={{ marginTop: 10 }}>
              <div className={styles.selectedCarTitle}>Primär kund</div>
              {loadingCustomers ? (
                <div className={styles.info}>Laddar kunder…</div>
              ) : errorCustomers ? (
                <div className={styles.info} style={{ color: "#b91c1c" }}>
                  {errorCustomers}
                </div>
              ) : primaryCustomer ? (
                <div className={styles.selectedCarBody} style={{ paddingTop: 6 }}>
                  <div>
                    <strong>
                      {primaryCustomer.first_name || "—"} {primaryCustomer.last_name || ""}
                    </strong>
                  </div>
                  <div>
                    {primaryCustomer.email || "—"} {primaryCustomer.phone ? ` • ${primaryCustomer.phone}` : ""}
                  </div>
                </div>
              ) : (
                <div className={styles.info}>Ingen primär kund vald.</div>
              )}
            </div>

            {/* Alla kunder länkade till bilen (i denna verkstad) */}
            <div style={{ marginTop: 10 }}>
              <div className={styles.selectedCarTitle}>Alla kopplade kunder</div>
              {loadingCustomers ? (
                <div className={styles.info}>Laddar…</div>
              ) : customers.length === 0 ? (
                <div className={styles.info}>Inga kunder kopplade ännu.</div>
              ) : (
                <div className={styles.resultBox} role="list" style={{ marginTop: 6 }}>
                  {customers.map((c) => {
                    const isPrimary = primaryCustomer && c.id === primaryCustomer.id
                    return (
                      <div
                        key={c.id}
                        role="listitem"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 0",
                        }}
                      >
                        <div>
                          <strong>
                            {c.first_name || "—"} {c.last_name || ""}
                          </strong>
                          <div className={styles.info} style={{ marginTop: 2 }}>
                            {c.email || "—"} {c.phone ? ` • ${c.phone}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {!isPrimary && (
                            <button
                              className={styles.selectBtn}
                              onClick={() => setAsPrimary(c.id)}
                              disabled={loadingCustomers}
                              title="Sätt som primär kund"
                            >
                              Sätt som primär
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className={styles.addBtn}
                  onClick={() => refreshCustomers(activeCar)}
                  disabled={loadingCustomers}
                >
                  Uppdatera lista
                </button>
                <button
                  className={styles.selectBtn}
                  onClick={() => setShowAddCustomer((v) => !v)}
                  disabled={loadingCustomers}
                >
                  {showAddCustomer ? "Avbryt" : "Lägg till & koppla kund"}
                </button>
              </div>

              {showAddCustomer && (
                <div style={{ marginTop: 10 }}>
                  <div className={styles.resultBox} style={{ padding: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label className={styles.label} htmlFor="custFirst">
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
                        <label className={styles.label} htmlFor="custLast">
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
                        <label className={styles.label} htmlFor="custEmail">
                          E-post <span className={styles.info}>(minst e-post eller telefon)</span>
                        </label>
                        <input
                          id="custEmail"
                          className={styles.input}
                          value={custEmail}
                          onChange={(e) => setCustEmail(e.target.value)}
                          placeholder="anna@exempel.se"
                          autoComplete="email"
                          type="email"
                        />
                      </div>
                      <div>
                        <label className={styles.label} htmlFor="custPhone">
                          Telefon <span className={styles.info}>(minst e-post eller telefon)</span>
                        </label>
                        <input
                          id="custPhone"
                          className={styles.input}
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          placeholder="+4670…"
                          autoComplete="tel"
                          type="tel"
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <input
                        id="custSetPrimary"
                        type="checkbox"
                        checked={custSetPrimary}
                        onChange={(e) => setCustSetPrimary(e.target.checked)}
                      />
                      <label htmlFor="custSetPrimary" className={styles.label} style={{ margin: 0 }}>
                        Sätt som primär kontakt för {activeCar.registration_number}
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className={styles.selectBtn}
                        onClick={saveInlineCustomer}
                        disabled={savingCustomer || !canSaveInlineCustomer}
                      >
                        {savingCustomer ? "Sparar…" : "Spara & koppla kund"}
                      </button>
                      <button
                        className={styles.addBtn}
                        onClick={() => setShowAddCustomer(false)}
                        disabled={savingCustomer}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {successNote && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "0.6rem 0.9rem",
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    color: "#166534",
                    borderRadius: 6,
                    fontSize: "0.95rem",
                  }}
                >
                  {successNote}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ======= Modal: förhandsgranska bil (befintligt) ======= */}
      <Modal
        open={!!previewCar}
        onClose={() => setPreviewCar(null)}
        title="Bekräfta vald bil"
        footer={
          <>
            <button className={styles.selectBtn} onClick={onConfirmPreview}>
              Bekräfta
            </button>
            <button className={styles.addBtn} onClick={() => setPreviewCar(null)}>
              Avbryt
            </button>
          </>
        }
      >
        {!previewCar ? (
          <div>Laddar…</div>
        ) : (
          <div className={styles.selectedCar}>
            <div className={styles.selectedCarTitle}>Bilinformation</div>
            <div className={styles.selectedCarBody}>
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
  )
}
