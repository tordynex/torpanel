import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useWorkshop } from "@/hooks/useWorkshops"
import styles from "./css/ServiceBay.module.css"
import Modal from "@/components/common/Modal"

import { fetchAllBays, BayType } from "@/services/servicebayService"
import type { WorkshopBayReadSimple } from "@/services/servicebayService"

// 🆕 Formuläret
import ServiceBayForm from "@/components/workshop/ServiceBayForm"

export default function ServiceBay() {
  const auth = useAuth()
  const userName = useMemo(() => auth?.username ?? "användare", [auth])

  const workshop = useWorkshop()
  const workshopId = workshop?.id

  const [bays, setBays] = useState<WorkshopBayReadSimple[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // 🆕 UI-state för modal + valt bay (null = create)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editBayId, setEditBayId] = useState<number | null>(null)

  const loadBays = useCallback(async () => {
    if (!workshopId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllBays(workshopId)
      setBays(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte hämta arbetsplatser")
    } finally {
      setLoading(false)
    }
  }, [workshopId])

  useEffect(() => {
    if (workshopId) {
      loadBays()
    }
  }, [workshopId, loadBays])

  const formatBayType = (t: BayType) => {
    switch (t) {
      case BayType.TWO_POST_LIFT: return "Tvåpelarlyft"
      case BayType.FOUR_POST_LIFT: return "Fyrpelarlyft"
      case BayType.FLOOR_SPACE: return "Golvplats"
      case BayType.ALIGNMENT_RACK: return "Hjulinställning"
      case BayType.DIAGNOSIS: return "Diagnos"
      case BayType.MOT_BAY: return "Kontrollplats"
      default: return t
    }
  }

  // 🆕 Öppna modal i create-läge
  const handleCreate = () => {
    setEditBayId(null)
    setIsModalOpen(true)
  }

  // 🆕 Öppna modal i edit-läge
  const handleEdit = (id: number) => {
    setEditBayId(id)
    setIsModalOpen(true)
  }

  const handleClose = () => setIsModalOpen(false)

  // 🆕 Efter lyckad submit: stäng och ladda om lista
  const handleSuccess = () => {
    setIsModalOpen(false)
    loadBays()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          {/* 🆕 Lägg till arbetsplats */}
          <button
            className={styles.refreshBtn}
            onClick={handleCreate}
            disabled={!workshopId}
            title={!workshopId ? "Ingen verkstad vald ännu" : "Skapa ny arbetsplats"}
          >
            Lägg till arbetsplats
          </button>
        </div>
      </header>

      <section className={styles.grid}>
        {/* Vänster: Korts-grid */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <h3 className={styles.cardTitle}>Dina arbetsplatser</h3>
            <button className={styles.refreshBtn} onClick={loadBays}>
              Uppdatera
            </button>
          </div>

          {loading && <div className={styles.placeholder}>Hämtar arbetsplatser…</div>}

          {error && !loading && (
            <div className={`${styles.placeholder} ${styles.errorPlaceholder}`}>
              {error}
            </div>
          )}

          {!loading && !error && bays.length === 0 && (
            <div className={styles.placeholder}>
              Inga arbetsplatser hittades för denna verkstad ännu.
            </div>
          )}

          {!loading && !error && bays.length > 0 && (
            <div className={styles.bayGrid}>
              {bays.map((b) => (
                <article key={b.id} className={styles.bayCard}>
                  <header className={styles.bayHeader}>
                    <h4 className={styles.bayTitle}>{b.name}</h4>
                    <span className={styles.bayTypeBadge}>{formatBayType(b.bay_type)}</span>
                  </header>

                  <div className={styles.bayMeta}>
                    <span className={styles.badgeSmall}>ID: {b.id}</span>
                    <span className={styles.badgeSmall}>Workshop: {b.workshop_id}</span>
                  </div>

                  {/* 🆕 Actions */}
                  <div className={styles.bayActions ?? undefined} style={!styles.bayActions ? { marginTop: 8 } : undefined}>
                    <button
                      className={styles.refreshBtn}
                      onClick={() => handleEdit(b.id)}
                      title="Redigera arbetsplats"
                    >
                      Redigera
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal
        open={isModalOpen}
        onClose={handleClose}
        title={editBayId ? "Redigera arbetsplats" : "Ny arbetsplats"}
      >
        {editBayId ? (
          <ServiceBayForm
            bayId={editBayId}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        ) : (
          <ServiceBayForm
            workshopId={workshopId!}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        )}
      </Modal>
    </div>
  )
}
