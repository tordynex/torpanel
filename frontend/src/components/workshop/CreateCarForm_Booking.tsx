import { useEffect, useMemo, useState } from "react"
import carService from "@/services/carService"
import type { CarCreate, Car } from "@/services/carService"
import crmService from "@/services/crmService"
import styles from "./css/CreateCarForm.module.css"
import allMakes from "@/utils/cars"

interface Props {
  onCreated: (car: Car) => void
  onCancel: () => void
  /** Förifyll registreringsnummer – t.ex. från användarens söksträng */
  initialRegistration?: string
  /** Verkstadens ID (krävs för att skapa/koppla kund) */
  workshopId: number
}

type CustomerForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  set_primary: boolean
}

export default function CreateCarForm({
  onCreated,
  onCancel,
  initialRegistration = "",
  workshopId,
}: Props) {
  const currentYear = new Date().getFullYear()
  const minYear = 1897
  const maxYear = currentYear + 1

  // Normalisering
  const normalizeReg = (s: string) => s.toUpperCase().replace(/\s+/g, "")
  const normalizeEmail = (s: string) => s.trim().toLowerCase()
  const normalizePhone = (s: string) => s.replace(/\s|-/g, "")

  const [formData, setFormData] = useState<CarCreate>({
    registration_number: normalizeReg(initialRegistration),
    brand: "",
    model_year: currentYear,
  })

  // Kund (valfritt)
  const [linkCustomer, setLinkCustomer] = useState(false)
  const [customer, setCustomer] = useState<CustomerForm>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    set_primary: true,
  })

  const [error, setError] = useState("")
  const [successNote, setSuccessNote] = useState("")
  const [loading, setLoading] = useState(false)

  // Uppdatera om initialRegistration ändras
  useEffect(() => {
    if (initialRegistration) {
      setFormData((prev) => ({
        ...prev,
        registration_number: normalizeReg(initialRegistration),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRegistration])

  const canSubmit = useMemo(() => {
    const validCar =
      !!formData.registration_number &&
      !!formData.brand &&
      !!formData.model_year &&
      Number(formData.model_year) >= minYear &&
      Number(formData.model_year) <= maxYear

    if (!linkCustomer) return validCar

    // Om kundsektionen är aktiv måste minst e-post eller telefon finnas
    const hasAnyContact =
      (customer.email && customer.email.trim().length > 0) ||
      (customer.phone && customer.phone.trim().length > 0)

    return validCar && hasAnyContact
  }, [formData, linkCustomer, customer, minYear, maxYear])

  // --- handlers (bil) ---
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target

    if (name === "registration_number") {
      setFormData((prev) => ({ ...prev, registration_number: value.toUpperCase() }))
      return
    }

    if (name === "model_year") {
      const num = parseInt(value || "0", 10)
      setFormData((prev) => ({
        ...prev,
        model_year: Number.isNaN(num) ? ("" as any) : num,
      }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleRegBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setFormData((prev) => ({
      ...prev,
      registration_number: normalizeReg(e.target.value),
    }))
  }

  const handleRegPaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text")
    const norm = normalizeReg(pasted)
    setFormData((prev) => ({ ...prev, registration_number: norm }))
  }

  // --- handlers (kund) ---
  const handleCustomerChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const { name, value, type, checked } = e.target
    if (name === "set_primary" && type === "checkbox") {
      setCustomer((prev) => ({ ...prev, set_primary: checked }))
      return
    }
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError("")
    setSuccessNote("")

    const yr = Number(formData.model_year)
    if (!formData.registration_number) {
      setError("Ange registreringsnummer.")
      return
    }
    if (!formData.brand) {
      setError("Välj bilmärke.")
      return
    }
    if (!yr || yr < minYear || yr > maxYear) {
      setError(`Ange ett giltigt modellår (${minYear}–${maxYear}).`)
      return
    }

    // Om kund ska länkas: kräver minst e-post eller telefon
    if (linkCustomer) {
      const hasAnyContact =
        (customer.email && customer.email.trim().length > 0) ||
        (customer.phone && customer.phone.trim().length > 0)
      if (!hasAnyContact) {
        setError("Ange minst e-post eller telefon för kunden.")
        return
      }
    }

    setLoading(true)
    try {
      // 1) Skapa bil
      const payload: CarCreate = {
        ...formData,
        registration_number: normalizeReg(formData.registration_number),
        brand: formData.brand,
        model_year: yr,
      }
      const car = await carService.createCar(payload)

      // 2) (Valfritt) skapa/koppla kund direkt till bilen
      if (linkCustomer) {
        const email = customer.email ? normalizeEmail(customer.email) : undefined
        const phone = customer.phone ? normalizePhone(customer.phone) : undefined

        await crmService.createCustomer({
          workshop_id: workshopId,
          first_name: customer.first_name || undefined,
          last_name: customer.last_name || undefined,
          email,
          phone,
          registration_number: car.registration_number, // koppla via regnr (bilen finns ju nu)
          set_primary: customer.set_primary,
        })
        setSuccessNote("Kund skapad & kopplad som primär kontakt.")
      }

      try {
          // anropa säkert om föräldern inte skickat in onCreated korrekt
          onCreated?.(car)
          return
        } catch (e) {
          console.error("onCreated callback saknas eller kastade fel:", e)
        }
        setSuccessNote("Bil skapad.")

    } catch (err) {
      console.error(err)
      setError(
        linkCustomer
          ? "Kunde inte skapa bil och/eller koppla kund. Kontrollera uppgifterna och försök igen."
          : "Kunde inte skapa bil. Kontrollera uppgifterna och försök igen."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.form} role="form">
      {/* Bil */}
      <div className={styles.field}>
        <label htmlFor="registration_number" className={styles.label}>
          Registreringsnummer
        </label>
        <input
          id="registration_number"
          name="registration_number"
          type="text"
          required
          className={styles.input}
          value={formData.registration_number}
          onChange={handleChange}
          onBlur={handleRegBlur}
          onPaste={handleRegPaste}
          placeholder="ABC123"
          autoComplete="off"
          inputMode="latin"
          aria-describedby="reg-help"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="brand" className={styles.label}>
          Märke
        </label>
        <select
          id="brand"
          name="brand"
          required
          className={styles.select ?? styles.input}
          value={formData.brand}
          onChange={handleChange}
          aria-describedby="brand-help"
        >
          <option value="" disabled>
            Välj bilmärke
          </option>
          {allMakes.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="model_year" className={styles.label}>
          Modellår
        </label>
        <input
          id="model_year"
          name="model_year"
          type="number"
          required
          className={styles.input}
          value={formData.model_year}
          min={minYear}
          max={maxYear}
          step={1}
          onChange={handleChange}
          aria-describedby="year-help"
          placeholder={`${currentYear}`}
          inputMode="numeric"
        />
      </div>

      {/* Koppla kund (valfritt) */}
      <div className={styles.divider} />

      <div className={styles.checkboxRow}>
        <input
          id="linkCustomer"
          type="checkbox"
          checked={linkCustomer}
          onChange={(e) => setLinkCustomer(e.target.checked)}
        />
        <label htmlFor="linkCustomer" className={styles.labelInline}>
          Koppla kund (valfritt)
        </label>
      </div>

      {linkCustomer && (
        <div className={styles.group}>
          <div className={styles.field}>
            <label htmlFor="first_name" className={styles.label}>
              Förnamn
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              className={styles.input}
              value={customer.first_name}
              onChange={handleCustomerChange}
              placeholder="Anna"
              autoComplete="given-name"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="last_name" className={styles.label}>
              Efternamn
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              className={styles.input}
              value={customer.last_name}
              onChange={handleCustomerChange}
              placeholder="Berg"
              autoComplete="family-name"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              E-post <span className={styles.optional}>(minst e-post eller telefon)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={styles.input}
              value={customer.email}
              onChange={handleCustomerChange}
              placeholder="anna@exempel.se"
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="phone" className={styles.label}>
              Telefon <span className={styles.optional}>(minst e-post eller telefon)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className={styles.input}
              value={customer.phone}
              onChange={handleCustomerChange}
              placeholder="+46701234567"
              autoComplete="tel"
            />
          </div>

          <div className={styles.checkboxRow}>
            <input
              id="set_primary"
              name="set_primary"
              type="checkbox"
              checked={customer.set_primary}
              onChange={handleCustomerChange}
            />
            <label htmlFor="set_primary" className={styles.labelInline}>
              Sätt som primär kontakt för bilen
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {successNote && (
        <div className={styles.success} role="status" aria-live="polite">
          {successNote}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={onCancel}
          disabled={loading}
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={loading || !canSubmit}
          aria-busy={loading}
        >
          {loading ? "Skapar…" : linkCustomer ? "Skapa & koppla kund" : "Skapa bil"}
        </button>
      </div>
    </div>
  )
}
