// src/services/upsellService.ts
import axios from "@/utils/axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL // (ej använd direkt här, men kvar om ni vill bygga fulla URLs)
const UPSELL_ENDPOINT = "/upsell"

// ===== Enums (matchar backend) =====
export type UpsellStatus =
  | "draft"
  | "pending_customer"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"

// ===== Types =====
export interface UpsellOffer {
  id: number

  // Backend kopplar primärt mot booking_id
  booking_id: number

  // Kan finnas om bokningen redan har en servicelog
  service_log_id?: number | null

  workshop_id: number
  customer_id?: number | null
  car_id?: number | null

  title: string
  recommendation?: string | null
  sms_body?: string | null

  price_gross_ore: number
  vat_percent?: number | null
  currency?: string | null

  status: UpsellStatus
  sent_at?: string | null
  expires_at?: string | null
  responded_at?: string | null
}

export interface UpsellCreate {
  booking_id: number
  title: string
  recommendation?: string
  price_gross_sek: number
  vat_percent?: number

  // Om användaren skriver egen text redan vid utkast
  sms_override?: string

  // Giltighetstid (om ej används tar backend default)
  expires_hours?: number
}

export interface UpsellLinks {
  approve_url: string
  decline_url: string
}

// ===== Helpers =====
const authHeader = () => {
  const t = localStorage.getItem("access_token") || sessionStorage.getItem("access_token")
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ===== API Calls =====

/**
 * Skapa nytt utkast för merförsäljning
 */
export const createUpsellDraft = async (data: UpsellCreate): Promise<UpsellOffer> => {
  const res = await axios.post(`${UPSELL_ENDPOINT}/draft`, data, { headers: authHeader() })
  return res.data as UpsellOffer
}

/**
 * Hämta approve/decline-länkar för ett utkast (baserat på approval_token på servern)
 * (Minimal backendändring: GET /upsell/{offer_id}/links som returnerar enkel dict)
 */
export const getUpsellLinks = async (offerId: number): Promise<UpsellLinks> => {
  const res = await axios.get(`${UPSELL_ENDPOINT}/${offerId}/links`, { headers: authHeader() })
  return res.data as UpsellLinks
}

/**
 * Skicka ett utkast (ändrar status till PENDING och skickar SMS).
 * Om smsOverride skickas, används exakt den texten som SMS (via query-param).
 * (Minimal backendändring: sms_override tas emot som query-param på /send)
 */
export const sendUpsellOffer = async (offerId: number, smsOverride?: string): Promise<UpsellOffer> => {
  const url = smsOverride
    ? `${UPSELL_ENDPOINT}/${offerId}/send?sms_override=${encodeURIComponent(smsOverride)}`
    : `${UPSELL_ENDPOINT}/${offerId}/send`
  const res = await axios.post(url, null, { headers: authHeader() })
  return res.data as UpsellOffer
}

/**
 * Kund godkänner via token-länk (offentligt endpoint – ingen auth)
 */
export const approveUpsell = async (token: string): Promise<{ status: string }> => {
  const res = await axios.post(`${UPSELL_ENDPOINT}/u/${token}/approve`)
  return res.data
}

/**
 * Kund avböjer via token-länk (offentligt endpoint – ingen auth)
 */
export const declineUpsell = async (token: string): Promise<{ status: string }> => {
  const res = await axios.post(`${UPSELL_ENDPOINT}/u/${token}/decline`)
  return res.data
}

export default {
  createUpsellDraft,
  getUpsellLinks,
  sendUpsellOffer,
  approveUpsell,
  declineUpsell,
}
