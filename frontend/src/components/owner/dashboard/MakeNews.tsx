import React, { useCallback, useMemo, useState } from "react"
import { FiSave, FiRefreshCcw, FiAlertCircle, FiCheckCircle, FiCalendar, FiType, FiFileText } from "react-icons/fi"
import styles from "./css/MakeNews.module.css"
import { createNews, type News, type NewsCreate } from "@/services/newsService"

type Props = {
  /** Anropas efter lyckad skapning om du vill uppdatera listor i föräldern */
  onCreated?: (news: News) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD

export default function MakeNews({ onCreated }: Props) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [date, setDate] = useState(todayISO())

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isValid = useMemo(() => {
    return title.trim().length > 0 && content.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
  }, [title, content, date])

  const resetForm = useCallback(() => {
    setTitle("")
    setContent("")
    setDate(todayISO())
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!isValid) {
      setError("Fyll i titel, innehåll och ett giltigt datum (YYYY-MM-DD).")
      return
    }

    setSubmitting(true)
    try {
      const payload: NewsCreate = { title: title.trim(), content: content.trim(), date }
      const created = await createNews(payload)
      setSuccess("Nyheten skapades.")
      if (onCreated) onCreated(created)
      resetForm()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Kunde inte skapa nyheten.")
    } finally {
      setSubmitting(false)
    }
  }, [isValid, title, content, date, onCreated, resetForm])

  const handleResetClick = useCallback(() => {
    resetForm()
    setError(null)
    setSuccess(null)
  }, [resetForm])

  return (
    <section className={styles.card} aria-labelledby="make-news-title">
      <div className={styles.header}>
        <h2 id="make-news-title" className={styles.title}>
          Skapa nyhet
        </h2>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={handleResetClick}
            disabled={submitting}
            title="Rensa formulär"
          >
            <FiRefreshCcw aria-hidden /> Rensa
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.alertError} role="alert">
          <FiAlertCircle aria-hidden /> {error}
        </div>
      )}
      {success && (
        <div className={styles.alertSuccess} role="status">
          <FiCheckCircle aria-hidden /> {success}
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* Titel */}
        <label className={styles.field}>
          <span className={styles.label}>
            <FiType aria-hidden /> Titel
          </span>
          <input
            type="text"
            className={styles.input}
            placeholder="Skriv en tydlig rubrik…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
          <span className={styles.helpText}>
            Max 200 tecken. Håll det kort och tydligt.
          </span>
        </label>

        {/* Datum */}
        <label className={styles.field}>
          <span className={styles.label}>
            <FiCalendar aria-hidden /> Datum
          </span>
          <input
            type="date"
            className={styles.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <span className={styles.helpText}>Publiceringsdatum för nyheten.</span>
        </label>

        {/* Innehåll */}
        <label className={styles.field}>
          <span className={styles.label}>
            <FiFileText aria-hidden /> Innehåll
          </span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Skriv nyhetsinnehållet här…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            required
          />
          <span className={styles.helpText}>
            En kort text går bra – du kan alltid uppdatera senare.
          </span>
        </label>

        <div className={styles.footerRow}>
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!isValid || submitting}
            title="Spara nyheten"
          >
            <FiSave aria-hidden /> {submitting ? "Sparar…" : "Spara nyhet"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleResetClick}
            disabled={submitting}
            title="Återställ"
          >
            Återställ
          </button>
        </div>
      </form>
    </section>
  )
}
