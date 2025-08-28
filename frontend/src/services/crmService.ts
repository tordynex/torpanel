import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const CRM_ENDPOINT = `${API_BASE}/crm`

// ===== Types (matchar backend) =====
export interface Customer {
  id: number
  workshop_id: number
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  last_workshop_visited?: string | null
}

export interface CustomerCreate {
  workshop_id: number
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  last_workshop_visited?: string
}

export interface CustomerCreateWithLink extends CustomerCreate {
  /** Valfritt: länka direkt till bil via car_id */
  car_id?: number
  /** Valfritt: eller länka via registreringsnummer (skapar bil om den saknas) */
  registration_number?: string
  /** Sätt som primär kontakt för bilen (default: true) */
  set_primary?: boolean
}

/**
 * Hämta kunder för en verkstad (med valfri söksträng och limit)
 * Ex: fetchWorkshopCustomers(123, { q: "anna", limit: 50 })
 */
export const fetchWorkshopCustomers = async (
  workshopId: number,
  opts?: { q?: string; limit?: number }
): Promise<Customer[]> => {
  const res = await axios.get(
    `${CRM_ENDPOINT}/workshops/${workshopId}/customers`,
    { params: opts }
  )
  return res.data
}

/**
 * Hämta kunder kopplade till en bil
 * Valfritt filtrera inom en specifik verkstad (workshop_id)
 */
export const fetchCarCustomers = async (
  carId: number,
  workshopId?: number
): Promise<Customer[]> => {
  const res = await axios.get(`${CRM_ENDPOINT}/cars/${carId}/customers`, {
    params: workshopId != null ? { workshop_id: workshopId } : undefined,
  })
  return res.data
}

/**
 * Hämta primär kund för en bil (globalt eller inom en verkstad)
 */
export const fetchPrimaryCustomerForCar = async (
  carId: number,
  workshopId?: number
): Promise<Customer> => {
  const res = await axios.get(
    `${CRM_ENDPOINT}/cars/${carId}/primary-customer`,
    { params: workshopId != null ? { workshop_id: workshopId } : undefined }
  )
  return res.data
}

/**
 * Hämta en specifik kund
 */
export const fetchCustomerById = async (customerId: number): Promise<Customer> => {
  const res = await axios.get(`${CRM_ENDPOINT}/customers/${customerId}`)
  return res.data
}

/**
 * Skapa kund och valfritt koppla till bil (via car_id eller registration_number)
 */
export const createCustomer = async (
  payload: CustomerCreateWithLink
): Promise<Customer> => {
  const res = await axios.post(`${CRM_ENDPOINT}/customers/create`, payload)
  return res.data
}

export default {
  fetchWorkshopCustomers,
  fetchCarCustomers,
  fetchPrimaryCustomerForCar,
  fetchCustomerById,
  createCustomer,
}
