import React, { useCallback, useEffect, useMemo, useState } from "react"
import { FiRefreshCcw, FiAlertCircle, FiCalendar } from "react-icons/fi"
import { IoIosMegaphone } from "react-icons/io";
import styles from "./css/NewsBox.module.css"
import { fetchAllNews, type News } from "@/services/newsService"

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    })
  } catch {
    return iso
  }
}

const previewText = (text: string, max = 220) => {
  const t = (text ?? "").trim().replace(/\s+/g, " ")
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + "…"
}

export default function NewsBox() {
  const [items, setItems] = useState<News[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllNews()
      setItems(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Kunde inte hämta nyheter")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const latestTwo = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        if (db !== da) return db - da
        return (b.id ?? 0) - (a.id ?? 0)
      })
      .slice(0, 2)
  }, [items])

  return (
    <section className={styles.brCard}>
      {/* Header */}
      <div className={styles.brHeader}>
        <div className={styles.brTitle}>
          <IoIosMegaphone aria-hidden /> Nyheter
        </div>
        <div className={styles.brActions}>
          <button
            className={`${styles.brBtn} ${styles.brBtnGhost}`}
            onClick={fetchData}
            disabled={loading}
            title="Uppdatera"
          >
            <FiRefreshCcw aria-hidden /> Uppdatera
          </button>
        </div>
      </div>

      {/* Status / errors */}
      {error && (
        <div className={styles.brAlert} role="alert">
          <FiAlertCircle aria-hidden /> {error}
        </div>
      )}

      {/* Lista */}
      <div className={styles.brList}>
        {loading ? (
          <div className={styles.brSkeletonList}>
            <div className={styles.brSkeleton} />
            <div className={styles.brSkeleton} />
          </div>
        ) : latestTwo.length === 0 ? (
          <div className={styles.brEmpty}>Inga nyheter att visa just nu.</div>
        ) : (
          latestTwo.map((n) => (
            <article key={n.id} className={styles.brItem}>
              {/* Header för item */}
              <header className={styles.brItemHeader}>
                <div className={styles.brId}>{n.title}</div>
                <div className={styles.brTime} title={n.date}>
                  <FiCalendar aria-hidden /> {formatDate(n.date)}
                </div>
              </header>

              {/* Body */}
              <div className={styles.brItemBody}>
                <div className={styles.brMsgText}>{previewText(n.content)}</div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
