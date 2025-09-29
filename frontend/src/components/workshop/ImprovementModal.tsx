import React, { useCallback, useEffect, useRef, useState } from "react"
import { FiX, FiSend, FiAlertCircle, FiCheckCircle, FiMail, FiUser, FiGlobe, FiHash, FiMessageSquare } from "react-icons/fi"
import styles from "./css/ImprovementModal.module.css"
import { suggestImprovement, type SuggestPayload } from "@/services/improvementService"

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Förifyll (valfritt) */
  defaultEmail?: string
  defaultName?: string
  page?: string
  appVersion?: string
  /** Körs efter lyckat skick */
  onSubmitted?: () => void
}

export default function ImprovementModal({
  isOpen,
  onClose,
  defaultEmail,
  defaultName,
  page,
  appVersion,
  onSubmitted,
}: Props) {
  const [message, setMessage] = useState("")
  const [senderEmail, setSenderEmail] = useState(defaultEmail ?? "")
  const [senderName, setSenderName] = useState(defaultName ?? "")
  const [pageVal, setPageVal] = useState(page ?? "")
  const [versionVal, setVersionVal] = useState(appVersion ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null)

  // Reset när modalen öppnas/stängs
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setSuccess(null)
      // Fokus på första fältet
      setTimeout(() => firstFieldRef.current?.focus(), 10)
    } else {
      // valfritt: lämna kvar text om du vill låta användaren återöppna utan förlust
      // här nollställer vi inte för att inte tappa input oavsiktligt
    }
  }, [isOpen])

  // ESC för att stänga
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  const valid = message.trim().length >= 10

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSuccess(null)

      if (!valid) {
        setError("Skriv minst 10 tecken så vi förstår ditt förslag.")
        return
      }

      setSubmitting(true)
      try {
        const payload: SuggestPayload = {
          message: message.trim(),
          sender_email: senderEmail.trim() || undefined,
          sender_name: senderName.trim() || undefined,
          page: pageVal.trim() || undefined,
          app_version: versionVal.trim() || undefined,
        }
        await suggestImprovement(payload)
        setSuccess("Tack! Ditt förslag har skickats.")
        setMessage("")
        if (onSubmitted) onSubmitted()
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || "Kunde inte skicka just nu.")
      } finally {
        setSubmitting(false)
      }
    },
    [valid, message, senderEmail, senderName, pageVal, versionVal, onSubmitted]
  )

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleOverlayClick} aria-hidden={false}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="improve-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className={styles.header}>
          <h2 id="improve-title" className={styles.title}>Föreslå förändring</h2>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.btnGhost}`}
            onClick={onClose}
            aria-label="Stäng"
            title="Stäng"
          >
            <FiX aria-hidden />
          </button>
        </header>

        {/* Alerts */}
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

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}><FiMessageSquare aria-hidden /> Ditt förslag*</span>
            <textarea
              ref={firstFieldRef}
              className={`${styles.input} ${styles.textarea}`}
              placeholder="Beskriv vad du vill förbättra eller ändra…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              minLength={10}
              required
            />
            <span className={styles.helpText}>Minst 10 tecken.</span>
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}><FiMail aria-hidden /> Din e-post (valfritt)</span>
              <input
                type="email"
                className={styles.input}
                placeholder="namn@exempel.se"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}><FiUser aria-hidden /> Namn (valfritt)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Ditt namn"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                maxLength={120}
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}><FiGlobe aria-hidden /> Sida/kontext (valfritt)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="t.ex. /dashboard, Bokningar, Nyheter"
                value={pageVal}
                onChange={(e) => setPageVal(e.target.value)}
                maxLength={300}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}><FiHash aria-hidden /> App-version (valfritt)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="t.ex. 1.3.0"
                value={versionVal}
                onChange={(e) => setVersionVal(e.target.value)}
                maxLength={50}
              />
            </label>
          </div>

          <div className={styles.footer}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!valid || submitting}
              title="Skicka förslag"
            >
              <FiSend aria-hidden /> {submitting ? "Skickar…" : "Skicka"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={onClose}
              disabled={submitting}
              title="Avbryt"
            >
              Avbryt
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
