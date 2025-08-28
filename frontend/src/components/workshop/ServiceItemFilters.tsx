import React, { useState } from "react"
import styles from "./css/ServiceItem.module.css"

type VehicleClass = "CAR" | "VAN" | "SUV" | "EV" | "OTHER"

export interface FilterState {
  q?: string
  active?: "ALL" | "ACTIVE" | "INACTIVE"
  vehicle_class?: VehicleClass | "ALL"
}

interface Props {
  value: FilterState
  onChange: (next: FilterState) => void
  onCreateNew?: () => void
}

export default function ServiceItemFilters({ value, onChange, onCreateNew }: Props) {
  const [local, setLocal] = useState<FilterState>({
    q: value.q ?? "",
    active: value.active ?? "ACTIVE",
    vehicle_class: value.vehicle_class ?? "ALL",
  })

  const apply = (patch: Partial<FilterState>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    onChange(next)
  }

  return (
    <div className={styles.topbar}>

      <div className={styles.controls}>
          <div className={styles.field}>
            <label className={styles.selectLabel}>Sök</label>
            <input
              className={styles.select}
              placeholder="Namn…"
              value={local.q}
              onChange={(e) => apply({ q: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.selectLabel}>Status</label>
            <select
              className={styles.select}
              value={local.active}
              onChange={(e) => apply({ active: e.target.value as FilterState["active"] })}
            >
              <option value="ALL">Alla</option>
              <option value="ACTIVE">Aktiva</option>
              <option value="INACTIVE">Inaktiva</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.selectLabel}>Klass</label>
            <select
              className={styles.select}
              value={local.vehicle_class}
              onChange={(e) => apply({ vehicle_class: e.target.value as FilterState["vehicle_class"] })}
            >
              <option value="ALL">Alla</option>
              <option value="CAR">CAR</option>
              <option value="VAN">VAN</option>
              <option value="SUV">SUV</option>
              <option value="EV">EV</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onCreateNew}
            type="button"
          >
            + Ny tjänst
          </button>
        </div>
    </div>
  )
}
