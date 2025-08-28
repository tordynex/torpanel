import React from "react"
import styles from "./css/ServiceItem.module.css"
import type { WorkshopServiceItem } from "@/services/workshopserviceitemService"

import { FiTrash2 } from "react-icons/fi";

interface Props {
  item: WorkshopServiceItem
  onEdit?: (item: WorkshopServiceItem) => void
  onToggle?: (item: WorkshopServiceItem) => void
  onDelete?: (item: WorkshopServiceItem) => void
}

const kr = (ore?: number | null) =>
  typeof ore === "number"
    ? new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(
        ore / 100
      )
    : "—"

const mins = (m?: number | null) =>
  typeof m === "number" && m > 0 ? `${m} min` : "—"

// Mjuk mapping för fordonsklass (NULL = “alla”)
const vehicleLabel = (vc?: string | null) => {
  if (!vc) return "Alla fordon"
  const map: Record<string, string> = {
    all: "Alla fordon",
    motorcycle: "MC",
    small_car: "Småbil",
    sedan: "Sedan",
    suv: "SUV",
    van: "Skåpbil",
    pickup: "Pickup",
    light_truck: "Lätt lastbil",
  }
  return map[vc] || vc
}

export default function ServiceItemCard({ item, onEdit, onToggle, onDelete }: Props) {
  const statusClass = item.is_active ? "status-completed" : "status-cancelled"
  const badgeText = item.is_active ? "Aktiv" : "Inaktiv"

  const pt = (item.price_type ?? "").toString().toLowerCase()
  const isFixed = pt === "fixed"
  const isHourly = pt === "hourly"

  const priceText = isFixed
    ? kr(item.fixed_price_ore)
    : isHourly && item.hourly_rate_ore != null
    ? `${kr(item.hourly_rate_ore)}/h`
    : "—"

  const typeText = isFixed ? "Fast pris" : "Timpris"

  return (
    <div className={`${styles.booking} ${styles[statusClass]}`} style={{ position: "relative", margin: 8 }}>
      <div className={styles.bookingHead}>
        <div className={styles.bookingTitle} title={item.name}>
          {item.name}
        </div>
        <span className={styles.badge}>{badgeText}</span>
      </div>

      <div className={styles.bookingMeta}>
        {vehicleLabel(item.vehicle_class)} · {typeText} · {priceText}
      </div>
      <div className={styles.bookingMeta}>
        Standardtid: {mins(item.default_duration_min)} · Moms: {item.vat_percent ?? 25}%
      </div>
      {item.description && (
        <div className={styles.bookingMeta} style={{ marginTop: 4 }}>
          {item.description}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onEdit?.(item)}>
          Redigera
        </button>
        <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onToggle?.(item)}>
          {item.is_active ? "Inaktivera" : "Aktivera"}
        </button>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onDelete?.(item)}>
          <FiTrash2 />
        </button>
      </div>
    </div>
  )
}
