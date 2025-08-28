import axios from "@/utils/axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const BR_ENDPOINT = `${API_BASE}/bookingrequests`

// ===== Enums (matchar backend) =====
export type BookingRequestStatus = "open" | "handled" | "converted_to_booking"

// ===== Types från dina schemas =====
export interface BookingRequestCreate {
  workshop_id: number
  service_item_id?: number | null

  service_item_ids?: number[]

  customer_id?: number | null
  car_id?: number | null

  registration_number?: string | null

  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null

  message?: string | null
}

export interface BookingRequestUpdate {
  status?: BookingRequestStatus
  message?: string | null

  customer_id?: number | null
  car_id?: number | null
  registration_number?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}

export interface BookingRequest {
  id: number
  workshop_id: number
  service_item_id?: number | null

  customer_id?: number | null
  car_id?: number | null
  registration_number?: string | null

  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null

  message?: string | null
  status: BookingRequestStatus

  created_at: string // ISO
  updated_at: string // ISO
}

// ===== API-funktioner =====

/**
 * Skapa en booking request (publikt flöde när service_item.request_only = true)
 */
export const createBookingRequest = async (
  payload: BookingRequestCreate
): Promise<BookingRequest> => {
  const res = await axios.post(`${BR_ENDPOINT}/create`, payload)
  return res.data
}

/**
 * Lista booking requests för en verkstad (dashboard)
 * - status (optional): "open" | "handled" | "converted_to_booking"
 * - created_from / created_to (optional): Date eller ISO-string
 */
export const fetchBookingRequestsForWorkshop = async (
  workshopId: number,
  opts?: {
    status?: BookingRequestStatus
    created_from?: Date | string
    created_to?: Date | string
  }
): Promise<BookingRequest[]> => {
  const params: Record<string, string> = {}

  if (opts?.status) params.status = opts.status
  if (opts?.created_from) {
    params.created_from =
      typeof opts.created_from === "string"
        ? opts.created_from
        : opts.created_from.toISOString()
  }
  if (opts?.created_to) {
    params.created_to =
      typeof opts.created_to === "string"
        ? opts.created_to
        : opts.created_to.toISOString()
  }

  const res = await axios.get(`${BR_ENDPOINT}/workshop/${workshopId}`, {
    params: Object.keys(params).length ? params : undefined,
  })
  return res.data
}

/**
 * Hämta en booking request
 */
export const fetchBookingRequestById = async (
  bookingRequestId: number
): Promise<BookingRequest> => {
  const res = await axios.get(`${BR_ENDPOINT}/${bookingRequestId}`)
  return res.data
}

/**
 * Uppdatera en booking request (status, länka kund/bil, kontaktinfo, meddelande)
 */
export const updateBookingRequest = async (
  bookingRequestId: number,
  data: BookingRequestUpdate
): Promise<BookingRequest> => {
  const res = await axios.patch(`${BR_ENDPOINT}/${bookingRequestId}`, data)
  return res.data
}

/**
 * Radera en booking request
 */
export const deleteBookingRequest = async (
  bookingRequestId: number
): Promise<void> => {
  await axios.delete(`${BR_ENDPOINT}/${bookingRequestId}`)
}

export default {
  createBookingRequest,
  fetchBookingRequestsForWorkshop,
  fetchBookingRequestById,
  updateBookingRequest,
  deleteBookingRequest,
}
