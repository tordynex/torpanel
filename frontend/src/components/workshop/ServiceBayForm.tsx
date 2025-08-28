import React, { useEffect, useMemo, useState } from "react"
import styles from "./css/CreateCarForm.module.css" // Återanvänd samma tema
import {BayType, VehicleClass, createBay, fetchBay, updateBay,} from "@/services/servicebayService"
import type {WorkshopBayCreate, WorkshopBayRead, WorkshopBayUpdate} from "@/services/servicebayService"


// ---------------------------------------------
// Typer & Hjälpare
// ---------------------------------------------

type Mode = "create" | "edit"

export interface ServiceBayFormProps {
  /** Skapa-läge kräver workshopId */
  workshopId?: number
  /** Redigera-läge kräver bayId */
  bayId?: number
  /** Om du redan laddat platsen externt kan du mata in den här för att slippa fetch */
  initialBay?: WorkshopBayRead
  /** Anropas vid lyckad submit (skapa eller uppdatera) */
  onSuccess?: (bay: WorkshopBayRead) => void
  /** Stäng/tillbaka-knapp */
  onCancel?: () => void
}

interface FormState {
  name: string
  bay_type: BayType
  max_length_mm: number | "" | null
  max_width_mm: number | "" | null
  max_height_mm: number | "" | null
  max_weight_kg: number | "" | null
  allow_overnight: boolean
  notes: string
  vehicle_classes: VehicleClass[]
}

const defaultState: FormState = {
  name: "",
  bay_type: BayType.TWO_POST_LIFT,
  max_length_mm: "",
  max_width_mm: "",
  max_height_mm: "",
  max_weight_kg: "",
  allow_overnight: false,
  notes: "",
  vehicle_classes: [],
}

const bayTypeLabels: Record<BayType, string> = {
  [BayType.TWO_POST_LIFT]: "Tvåpelarlyft",
  [BayType.FOUR_POST_LIFT]: "Fyrpelarlyft",
  [BayType.FLOOR_SPACE]: "Golvplats",
  [BayType.ALIGNMENT_RACK]: "Hjulinställning",
  [BayType.DIAGNOSIS]: "Diagnosplats",
  [BayType.MOT_BAY]: "Besiktningsplats (MOT)",
}

const vehicleClassLabels: Record<VehicleClass, string> = {
  [VehicleClass.MOTORCYCLE]: "MC",
  [VehicleClass.SMALL_CAR]: "Liten bil",
  [VehicleClass.SEDAN]: "Sedan",
  [VehicleClass.SUV]: "SUV",
  [VehicleClass.VAN]: "Skåpbil",
  [VehicleClass.PICKUP]: "Pickup",
  [VehicleClass.LIGHT_TRUCK]: "Lätt lastbil",
}

function toNumberOrNull(value: number | "" | null): number | null {
  return value === "" || value === null ? null : Number(value)
}

// ---------------------------------------------
// Huvudkomponenten
// ---------------------------------------------

const ServiceBayForm: React.FC<ServiceBayFormProps> = ({
  workshopId,
  bayId,
  initialBay,
  onSuccess,
  onCancel,
}) => {
  const mode: Mode = bayId ? "edit" : "create"

  const [form, setForm] = useState<FormState>(defaultState)
  const [supportedClasses, setSupportedClasses] = useState<VehicleClass[] | null>(null)
  const [loading, setLoading] = useState<boolean>(mode === "edit")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill i edit-läge
  useEffect(() => {
    let ignore = false

    async function load() {
      if (mode === "edit") {
        try {
          setLoading(true)
          const data = initialBay ?? (bayId ? await fetchBay(bayId) : null)
          if (!ignore && data) {
            setForm({
              name: data.name ?? "",
              bay_type: data.bay_type,
              max_length_mm: data.max_length_mm ?? "",
              max_width_mm: data.max_width_mm ?? "",
              max_height_mm: data.max_height_mm ?? "",
              max_weight_kg: data.max_weight_kg ?? "",
              allow_overnight: Boolean(data.allow_overnight),
              notes: data.notes ?? "",
              vehicle_classes: (data as WorkshopBayRead).supported_vehicle_classes ?? [],
            })
            setSupportedClasses((data as WorkshopBayRead).supported_vehicle_classes ?? [])
          }
        } catch (e: any) {
          console.error(e)
          if (!ignore) setError(e?.message ?? "Kunde inte ladda serviceplatsen.")
        } finally {
          if (!ignore) setLoading(false)
        }
      }
    }

    load()
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bayId])

  const canSubmit = useMemo(() => {
    if (submitting || loading) return false
    if (!form.name.trim()) return false
    if (mode === "create" && !workshopId) return false
    return true
  }, [form.name, mode, workshopId, submitting, loading])

  function handleChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleVehicleClassToggle(vc: VehicleClass) {
    setForm((prev) => {
      const exists = prev.vehicle_classes.includes(vc)
      const next = exists
        ? prev.vehicle_classes.filter((v) => v !== vc)
        : [...prev.vehicle_classes, vc]
      return { ...prev, vehicle_classes: next }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      if (mode === "create") {
        const payload: WorkshopBayCreate = {
          workshop_id: Number(workshopId),
          name: form.name.trim(),
          bay_type: form.bay_type,
          max_length_mm: toNumberOrNull(form.max_length_mm),
          max_width_mm: toNumberOrNull(form.max_width_mm),
          max_height_mm: toNumberOrNull(form.max_height_mm),
          max_weight_kg: toNumberOrNull(form.max_weight_kg),
          allow_overnight: Boolean(form.allow_overnight),
          notes: form.notes?.trim() || null,
          vehicle_classes: form.vehicle_classes.length ? form.vehicle_classes : null,
        }
        const created = await createBay(payload)
        onSuccess?.(created)
      } else if (mode === "edit" && bayId) {
        const payload: WorkshopBayUpdate = {
          name: form.name.trim() || undefined,
          bay_type: form.bay_type,
          max_length_mm: toNumberOrNull(form.max_length_mm),
          max_width_mm: toNumberOrNull(form.max_width_mm),
          max_height_mm: toNumberOrNull(form.max_height_mm),
          max_weight_kg: toNumberOrNull(form.max_weight_kg),
          allow_overnight: Boolean(form.allow_overnight),
          notes: form.notes?.trim() ?? null,
          vehicle_classes: form.vehicle_classes.length ? form.vehicle_classes : [],
        }
        const updated = await updateBay(bayId, payload)
        onSuccess?.(updated)
      }
    } catch (e: any) {
      console.error(e)
      setError(e?.response?.data?.detail ?? e?.message ?? "Något gick fel.")
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------
  // Render
  // ---------------------------------------------

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-busy={loading || submitting}>
      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>Namn</label>
        <input
          id="name"
          className={styles.input}
          type="text"
          placeholder="Ex. Lyft 1"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          required
        />
        <p className={styles.help}>Ett internt namn som teknikerna känner igen.</p>
      </div>

      <div className={styles.field}>
        <label htmlFor="bay_type" className={styles.label}>Typ av plats</label>
        <select
          id="bay_type"
          className={styles.select}
          value={form.bay_type}
          onChange={(e) => handleChange("bay_type", e.target.value as BayType)}
        >
          {Object.values(BayType).map((bt) => (
            <option key={bt} value={bt}>{bayTypeLabels[bt]}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Maxmått & vikt (valfritt)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="Längd (mm)"
            value={form.max_length_mm ?? ""}
            onChange={(e) => handleChange("max_length_mm", e.target.value === "" ? "" : Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="Bredd (mm)"
            value={form.max_width_mm ?? ""}
            onChange={(e) => handleChange("max_width_mm", e.target.value === "" ? "" : Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="Höjd (mm)"
            value={form.max_height_mm ?? ""}
            onChange={(e) => handleChange("max_height_mm", e.target.value === "" ? "" : Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            placeholder="Vikt (kg)"
            value={form.max_weight_kg ?? ""}
            onChange={(e) => handleChange("max_weight_kg", e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <p className={styles.help}>Lämna tomt om ej begränsat.</p>
      </div>

      <div className={styles.field}>
        <label htmlFor="allow_overnight" className={styles.label}>Tillåt övernattning</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="allow_overnight"
            type="checkbox"
            checked={form.allow_overnight}
            onChange={(e) => handleChange("allow_overnight", e.target.checked)}
          />
          <span className={styles.help}>Kan fordon stå kvar i bayen över natten?</span>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="notes" className={styles.label}>Noteringar</label>
        <textarea
          id="notes"
          className={styles.input}
          placeholder="Ex. låg takhöjd, endast hjulinställningar, etc."
          rows={3}
          value={form.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel} disabled={submitting}>
            Avbryt
          </button>
        )}
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canSubmit}>
          {submitting ? "Sparar…" : mode === "create" ? "Skapa plats" : "Spara ändringar"}
        </button>
      </div>
    </form>
  )
}

export default ServiceBayForm