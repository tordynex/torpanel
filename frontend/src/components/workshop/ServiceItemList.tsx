import React, { useEffect, useMemo, useState } from "react"
import styles from "./css/ServiceItem.module.css"
import ServiceItemFilters from "./ServiceItemFilters"
import type { FilterState } from "./ServiceItemFilters"
import ServiceItemCard from "./ServiceItemCard"
import ServiceItemForm from "./ServiceItemForm"
import { listServiceItemsForWorkshop, toggleServiceItemActive, deleteServiceItem, } from "@/services/workshopserviceitemService"
import type { WorkshopServiceItem } from "@/services/workshopserviceitemService"

interface Props {
  workshopId: number
}

export default function ServiceItemList({ workshopId }: Props) {
  const [items, setItems] = useState<WorkshopServiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    q: "",
    active: "ACTIVE",
    vehicle_class: "ALL",
  })

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<WorkshopServiceItem | null>(null)

  const serverParams = useMemo(() => {
    return {
      q: filters.q || undefined,
      active:
        filters.active === "ALL"
          ? undefined
          : filters.active === "ACTIVE"
          ? true
          : false,
      vehicle_class:
        !filters.vehicle_class || filters.vehicle_class === "ALL"
          ? undefined
          : (filters.vehicle_class as any),
    }
  }, [filters])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listServiceItemsForWorkshop(workshopId, serverParams)
      setItems(res)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Kunde inte hämta tjänster.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId, filters.q, filters.active, filters.vehicle_class])

  const handleCreateNew = () => {
    setEditItem(null)
    setShowForm(true)
  }

  const handleEdit = (item: WorkshopServiceItem) => {
    setEditItem(item)
    setShowForm(true)
  }

  const handleSaved = () => {
    setShowForm(false)
    setEditItem(null)
    load()
  }

  const handleToggle = async (item: WorkshopServiceItem) => {
    try {
      await toggleServiceItemActive(item.id)
      load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Kunde inte uppdatera status.")
    }
  }

  const handleDelete = async (item: WorkshopServiceItem) => {
    const ok = confirm(`Radera "${item.name}"? Detta går inte att ångra.`)
    if (!ok) return
    try {
      await deleteServiceItem(item.id)
      load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Kunde inte radera tjänsten.")
    }
  }

  return (
    <div className={styles.wrapper}>
      <ServiceItemFilters
        value={filters}
        onChange={setFilters}
        onCreateNew={handleCreateNew}
      />

    <div className={styles.scrollArea}>
      {/* Header (matchar 1fr 160px 120px) */}
      <div className={styles.headerGrid}>
        <div className={styles.headerDay}>Tjänst</div>
        <div className={styles.headerDay}>Pris</div>
        <div className={styles.headerDay}>Åtgärder</div>
      </div>

      {loading && (
        <div style={{ padding: 16, color: "var(--muted)" }}>Laddar…</div>
      )}

      {error && (
        <div
          style={{
            padding: 16,
            borderTop: `1px dashed var(--border)`,
            color: "#7f1d1d",
            background: "#fef2f2",
            borderBottom: `1px dashed var(--border)`,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{ padding: 16, color: "var(--muted)" }}>
          Inga tjänster matchar filtren.
        </div>
      )}

      <div style={{ padding: 8 }}>
        {items.map((it) => (
          <div key={it.id} className={styles.rowGrid}>
            {/* Kolumn 1: kortet (måste kunna krympa) */}
            <div style={{ minWidth: 0 }}>
              <ServiceItemCard
                item={it}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            </div>

            {/* Kolumn 2: Pris & typ */}
            <div style={{ padding: 12, fontSize: 14, color: "var(--text)" }}>
              {(() => {
                const pt = (it.price_type ?? "").toString().toLowerCase();
                const fmt = (ore?: number | null) =>
                  new Intl.NumberFormat("sv-SE", {
                    style: "currency",
                    currency: "SEK",
                  }).format(((ore ?? 0) as number) / 100);

                if (pt === "fixed") return fmt(it.fixed_price_ore);
                if (pt === "hourly" && it.hourly_rate_ore != null)
                  return `${fmt(it.hourly_rate_ore)}/h`;
                return "—";
              })()}
            </div>

            {/* Kolumn 3: Åtgärder */}
            <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => handleEdit(it)}
              >
                Redigera
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => handleToggle(it)}
              >
                {it.is_active ? "Inaktivera" : "Aktivera"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>


      {/* Inline “modal/panel” för formulär */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 40,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "var(--surface)",
              border: `1px solid var(--border)`,
              borderRadius: 8,
            }}
          >
            <ServiceItemForm
              workshopId={workshopId}
              initial={editItem || undefined}
              onSaved={handleSaved}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <span>
          <span className={styles.footerStrong}>{items.length}</span> tjänster
        </span>
        <div className={styles.footerRight}>Autonexo · Servicehantering</div>
      </div>
    </div>
  )
}
