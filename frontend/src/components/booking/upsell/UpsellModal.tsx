// src/components/.../UpsellModal.tsx
import { useEffect, useState } from "react"
import { FiX, FiSend } from "react-icons/fi"
import { MdOutlinePriceChange } from "react-icons/md"
import { FaRegCommentDots } from "react-icons/fa"
import { PiTextTBold } from "react-icons/pi"

import { useWorkshop } from "@/hooks/useWorkshops"
import { fetchBooking } from "@/services/baybookingService"
import upsellService from "@/services/upsellService"
import type { UpsellCreate, UpsellOffer } from "@/services/upsellService"

import styles from "./css/UpsellModal.module.css"

interface Props {
  bookingId: number
  onClose: () => void
  onSent?: (offer: UpsellOffer) => void
}

function buildSms({
  customerName,
  workshopName,
  title,
  price,
  approveUrl,
  declineUrl,
  regNr,
}: {
  customerName?: string
  workshopName?: string
  title: string
  price: number
  approveUrl?: string
  declineUrl?: string
  regNr?: string
}) {
  const hej = customerName ? `Hej ${customerName},` : "Hej,"
  const ws = workshopName || "verkstaden"

  const rows: string[] = []
  rows.push(`${hej} vi på ${ws} rekommenderar att du gör: ${title}${regNr ? ` på ${regNr}` : ""}.`)
  rows.push(`\nPris: ${price} kr inkl. moms.`)
  if (approveUrl) rows.push(`\nGodkänn här: ${approveUrl}`)
  if (declineUrl) rows.push(`Avböj här: ${declineUrl}`)
  rows.push(`\nMvh ${ws}`)
  return rows.join("\n")
}

export default function UpsellModal({ bookingId, onClose, onSent }: Props) {
  const workshop = useWorkshop() // -> { id, name, city, ... } eller undefined

  const [title, setTitle] = useState("")
  const [recommendation, setRecommendation] = useState("")
  const [price, setPrice] = useState<number | "">("")
  const [smsPreview, setSmsPreview] = useState("")
  const [draftId, setDraftId] = useState<number | null>(null)

  const [customerName, setCustomerName] = useState<string | undefined>(undefined)
  const [regNr, setRegNr] = useState<string | undefined>(undefined)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1) Hämta bokningskontext (kundens namn + regnr)
  useEffect(() => {
    ;(async () => {
      try {
        const b = await fetchBooking(bookingId)
        setCustomerName(b?.customer?.first_name || undefined)
        setRegNr(b?.car?.registration_number || undefined)
      } catch (e) {
        // Tysta fel – preview funkar ändå
        setCustomerName(undefined)
        setRegNr(undefined)
      }
    })()
  }, [bookingId])

  // 2) Skapa utkast + hämta länkar + bygg preview (med workshop.name från hooken)
  const handleCreateDraft = async () => {
    try {
      setLoading(true)
      setError(null)

      const payload: UpsellCreate = {
        booking_id: bookingId,
        title,
        recommendation,
        price_gross_sek: typeof price === "number" ? price : 0,
      }
      const created = await upsellService.createUpsellDraft(payload)
      setDraftId(created.id)

      const { approve_url, decline_url } = await upsellService.getUpsellLinks(created.id)

      const msg = buildSms({
        customerName,
        workshopName: workshop?.name || "verkstaden",
        title,
        price: typeof price === "number" ? price : 0,
        approveUrl: approve_url,
        declineUrl: decline_url,
        regNr,
      })
      setSmsPreview(msg)
    } catch (err) {
      console.error(err)
      setError("Misslyckades att skapa utkast")
    } finally {
      setLoading(false)
    }
  }

  // 3) Skicka exakt det som står i preview via sms_override
  const handleSend = async () => {
    if (!draftId) return
    try {
      setLoading(true)
      setError(null)
      const sent = await upsellService.sendUpsellOffer(draftId, smsPreview)
      onSent?.(sent)
      onClose()
    } catch (err) {
      console.error(err)
      setError("Misslyckades att skicka SMS")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.upsellPanel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Skapa merförsäljning</h2>
        <button onClick={onClose} className={styles.closeBtn} aria-label="Stäng">
          <FiX size={22} />
        </button>
      </header>

      <div className={styles.body}>
        <label className={styles.field}>
          <span><PiTextTBold /> Titel</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Påfyllning av spolarvätska"
          />
        </label>

        <label className={styles.field}>
          <span><FaRegCommentDots /> Rekommendation</span>
          <textarea
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            placeholder="Kort kommentar till kunden (valfritt)"
            rows={3}
          />
        </label>

        <label className={styles.field}>
          <span><MdOutlinePriceChange /> Pris (SEK inkl. moms)</span>
          <input
            type="number"
            value={price}
            onChange={(e) => {
              const v = e.target.value
              setPrice(v === "" ? "" : Number(v))
            }}
            placeholder="Ex: 295"
            min={0}
          />
        </label>

        <div className={styles.smsPreview}>
          <h3>SMS-förhandsvisning</h3>
          <textarea
            value={smsPreview}
            onChange={(e) => setSmsPreview(e.target.value)}
            placeholder="Här visas hur SMS:et kommer se ut. Du kan redigera innan utskick."
            rows={8}
          />
          {!draftId && (
            <small style={{ opacity: 0.7 }}>
              Klicka <b>Skapa förslag</b> för att generera länkar och text.
            </small>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      <footer className={styles.footer}>
        {!draftId ? (
          <button
            className={styles.btn}
            onClick={handleCreateDraft}
            disabled={loading || !title || price === "" || Number(price) <= 0}
          >
            Skapa förslag
          </button>
        ) : (
          <>
            <button className={styles.btnSecondary} onClick={onClose}>
              Avbryt
            </button>
            <button
              className={styles.btn}
              onClick={handleSend}
              disabled={loading || !smsPreview}
            >
              <FiSend />
              {loading ? "Skickar..." : "Skicka SMS"}
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
