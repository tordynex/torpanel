import React, { useMemo, useState } from "react"
import styles from "./css/ServiceItem.module.css"
import serviceItems from "@/utils/serviceitems"
import { createServiceItem, updateServiceItem } from "@/services/workshopserviceitemService"
import type {
  WorkshopServiceItem,
  WorkshopServiceItemCreate,
  WorkshopServiceItemUpdate,
} from "@/services/workshopserviceitemService"

// Endast två pris-typer behövs i UI
type PriceType = "hourly" | "fixed"

interface Props {
  workshopId: number
  initial?: WorkshopServiceItem
  onSaved?: (item: WorkshopServiceItem) => void
  onCancel?: () => void
}

const VAT_OPTIONS = [0, 6, 12, 25]

const kr = (ore?: number | null) =>
  typeof ore === "number"
    ? new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(ore / 100)
    : ""

export default function ServiceItemForm({ workshopId, initial, onSaved, onCancel }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")

  // NYTT: Förfrågan vs Komplett
  const [requestOnly, setRequestOnly] = useState<boolean>(initial?.request_only ?? false)

  // Prisblock (endast när requestOnly=false)
  const [priceType, setPriceType] = useState<PriceType>(
    (initial?.price_type as PriceType) ?? "fixed"
  )
  const [hourlyRateOre, setHourlyRateOre] = useState<number | "">(
    initial?.hourly_rate_ore ?? ""
  )
  const [fixedPriceOre, setFixedPriceOre] = useState<number | "">(
    initial?.fixed_price_ore ?? ""
  )
  const [vatPercent, setVatPercent] = useState<number | "">(initial?.vat_percent ?? 25)
  const [defaultDurationMin, setDefaultDurationMin] = useState<number | "">(
    initial?.default_duration_min ?? 60
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true)

  const isEdit = Boolean(initial)
  const title = isEdit ? "Redigera tjänst" : "Ny tjänst"

  // Validering:
  const canSubmit = useMemo(() => {
    if (!name) return false
    if (requestOnly) return true // endast namn/beskrivning
    // Komplett: pris måste vara korrekt ifyllt
    if (!priceType) return false
    if (priceType === "hourly" && (hourlyRateOre === "" || hourlyRateOre <= 0)) return false
    if (priceType === "fixed" && (fixedPriceOre === "" || fixedPriceOre <= 0)) return false
    return true
  }, [name, requestOnly, priceType, hourlyRateOre, fixedPriceOre])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      if (isEdit && initial) {
        // UPDATE
        let payload: WorkshopServiceItemUpdate = {
          name,
          description,
          request_only: requestOnly,
          is_active: isActive,
          // UI: fordonsklass borttagen -> spara alltid null (”alla”)
          vehicle_class: null,
        }

        if (!requestOnly) {
          payload = {
            ...payload,
            price_type: priceType,
            hourly_rate_ore: priceType === "hourly" ? (hourlyRateOre as number) : null,
            fixed_price_ore: priceType === "fixed" ? (fixedPriceOre as number) : null,
            vat_percent: typeof vatPercent === "number" ? vatPercent : 25,
            default_duration_min:
              typeof defaultDurationMin === "number" ? defaultDurationMin : 60,
          }
        } else {
          // Säkerställ att prisfält inte skickas vid request_only=true
          payload = {
            ...payload,
            price_type: undefined,
            hourly_rate_ore: undefined,
            fixed_price_ore: undefined,
            vat_percent: undefined,
            default_duration_min: undefined,
          }
        }

        const saved = await updateServiceItem(initial.id, payload)
        onSaved?.(saved)
      } else {
        // CREATE
        let payload: WorkshopServiceItemCreate = {
          workshop_id: workshopId,
          name,
          description,
          request_only: requestOnly,
          is_active: isActive,
          // UI: fordonsklass borttagen -> skicka alltid null (”alla fordon”)
          vehicle_class: null,
        }

        if (!requestOnly) {
          payload = {
            ...payload,
            price_type: priceType,
            hourly_rate_ore: priceType === "hourly" ? (hourlyRateOre as number) : null,
            fixed_price_ore: priceType === "fixed" ? (fixedPriceOre as number) : null,
            vat_percent: typeof vatPercent === "number" ? vatPercent : 25,
            default_duration_min:
              typeof defaultDurationMin === "number" ? defaultDurationMin : 60,
          }
        }

        const saved = await createServiceItem(payload)
        onSaved?.(saved)
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Kunde inte spara tjänsten.")
    } finally {
      setLoading(false)
    }
  }

  // kr → öre
  const handleKrChange =
    (setter: (v: number | "") => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\s/g, "").replace(",", ".")
      const num = Number(raw)
      if (isNaN(num)) return setter("")
      setter(Math.round(num * 100))
    }

  return (
    <form onSubmit={handleSubmit} className={styles.wrapper} style={{ height: "auto" }}>
      <div className={styles.topbar}>
        <div className={styles.title}>{title}</div>
        <div className={styles.controls}>
          <button type="button" onClick={onCancel} className={`${styles.btn} ${styles.btnGhost}`}>
            Avbryt
          </button>
          <button type="submit" disabled={!canSubmit || loading} className={`${styles.btn} ${styles.btnPrimary}`}>
            {loading ? "Sparar..." : isEdit ? "Spara" : "Skapa"}
          </button>
        </div>
      </div>

      <div style={{ padding: 16, background: "var(--surface)", borderTop: `1px solid var(--border)` }}>
        {error && (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#7f1d1d",
              borderRadius: 8,
              padding: 8,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Namn (med förslag) */}
        <div style={{ marginBottom: 12 }}>
          <label className={styles.selectLabel}>Tjänst</label>
          <input
            list="serviceItemOptions"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.select}
            placeholder="Välj eller skriv…"
            style={{ width: "100%", marginTop: 6 }}
          />
          <datalist id="serviceItemOptions">
            {serviceItems.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* Beskrivning */}
        <div style={{ marginBottom: 12 }}>
          <label className={styles.selectLabel}>Beskrivning</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.select}
            placeholder="Valfri beskrivning"
            rows={3}
            style={{ width: "100%", marginTop: 6 }}
          />
        </div>

        {/* NYTT: Typ – Förfrågan / Komplett */}
        <div style={{ marginBottom: 12 }}>
          <span className={styles.selectLabel}>Typ</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setRequestOnly(true)}
              className={`${styles.btn} ${requestOnly ? styles.btnPrimary : styles.btnGhost}`}
            >
              Förfrågan
            </button>
            <button
              type="button"
              onClick={() => setRequestOnly(false)}
              className={`${styles.btn} ${!requestOnly ? styles.btnPrimary : styles.btnGhost}`}
            >
              Komplett
            </button>
          </div>
          <div className={styles.selectLabel} style={{ marginTop: 6, opacity: 0.8 }}>
            {requestOnly
              ? "Kunden skickar förfrågan – inga prisfält behövs. Verkstaden tar kontakt."
              : "Komplett tjänst med pris och varaktighet som kan bokas direkt."}
          </div>
        </div>

        {/* Status alltid synlig */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ alignSelf: "flex-end" }}>
            <label className={styles.selectLabel} style={{ display: "block" }}>
              Status
            </label>
            <button
              type="button"
              onClick={() => setIsActive((p) => !p)}
              className={`${styles.btn} ${isActive ? styles.btnPrimary : styles.btnGhost}`}
              style={{ marginTop: 6 }}
            >
              {isActive ? "Aktiv" : "Inaktiv"}
            </button>
          </div>
        </div>

        {/* Prisblock – endast när Komplett */}
        {!requestOnly && (
          <>
            {/* Pris-typ */}
            <div style={{ marginBottom: 12 }}>
              <span className={styles.selectLabel}>Pris</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setPriceType("fixed")}
                  className={`${styles.btn} ${priceType === "fixed" ? styles.btnPrimary : styles.btnGhost}`}
                >
                  Fast pris
                </button>
                <button
                  type="button"
                  onClick={() => setPriceType("hourly")}
                  className={`${styles.btn} ${priceType === "hourly" ? styles.btnPrimary : styles.btnGhost}`}
                >
                  Timpris
                </button>
              </div>
            </div>

            {/* Prisfält */}
            {priceType === "fixed" ? (
              <div style={{ marginBottom: 12 }}>
                <label className={styles.selectLabel}>
                  Fast pris (kr) <strong>(ex. moms)</strong>
                </label>
                <input
                  inputMode="decimal"
                  placeholder="ex. 1 995"
                  className={styles.select}
                  style={{ width: "100%", marginTop: 6 }}
                  onChange={handleKrChange(setFixedPriceOre)}
                  value={fixedPriceOre === "" ? "" : String((fixedPriceOre as number) / 100).replace(".", ",")}
                />
                <div className={styles.selectLabel} style={{ marginTop: 4 }}>
                  {kr(fixedPriceOre as number)}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label className={styles.selectLabel}>
                  Timpris (kr/h)<strong>(ex. moms)</strong>
                </label>
                <input
                  inputMode="decimal"
                  placeholder="ex. 995"
                  className={styles.select}
                  style={{ width: "100%", marginTop: 6 }}
                  onChange={handleKrChange(setHourlyRateOre)}
                  value={hourlyRateOre === "" ? "" : String((hourlyRateOre as number) / 100).replace(".", ",")}
                />
                <div className={styles.selectLabel} style={{ marginTop: 4 }}>
                  {kr(hourlyRateOre as number)} / h
                </div>
              </div>
            )}

            {/* Varaktighet & moms */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className={styles.selectLabel}>Standardtid (min)</label>
                <input
                  type="number"
                  min={0}
                  className={styles.select}
                  style={{ width: "100%", marginTop: 6 }}
                  value={defaultDurationMin}
                  onChange={(e) =>
                    setDefaultDurationMin(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
              <div style={{ width: 160 }}>
                <label className={styles.selectLabel}>Moms %</label>
                <select
                  value={vatPercent}
                  onChange={(e) => setVatPercent(Number(e.target.value))}
                  className={styles.select}
                  style={{ width: "100%", marginTop: 6 }}
                >
                  {VAT_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.footer}>
        <span>
          <span className={styles.footerStrong}>{name || "Ny tjänst"}</span>{" "}
          {!requestOnly
            ? priceType === "fixed" && fixedPriceOre !== ""
              ? `· ${kr(fixedPriceOre as number)}`
              : priceType === "hourly" && hourlyRateOre !== ""
              ? `· ${kr(hourlyRateOre as number)}/h`
              : ""
            : "· Förfrågan"}
        </span>
        <div className={styles.footerRight}>
          {requestOnly ? "Skapa förfrågetjänst" : isEdit ? "Uppdatera befintlig tjänst" : "Skapa ny tjänst"}
        </div>
      </div>
    </form>
  )
}
