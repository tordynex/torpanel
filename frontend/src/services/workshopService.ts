import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const WORKSHOP_ENDPOINT = `${API_BASE}/workshops`

// ===== Enums (matchar backend) =====
export type UserRole = "owner" | "workshop_user" | "workshop_employee"

export type BayType =
  | "two_post_lift"
  | "four_post_lift"
  | "floor_space"
  | "alignment_rack"
  | "diagnosis"
  | "mot_bay"

export type VehicleClass =
  | "all"
  | "motorcycle"
  | "small_car"
  | "sedan"
  | "suv"
  | "van"
  | "pickup"
  | "light_truck"

export type ServicePriceType = "hourly" | "fixed"

// ===== Types från dina schemas =====
export interface UserSimple {
  id: number
  username: string
  email: string
  role: UserRole
}

export interface WorkshopBay {
  id: number
  workshop_id: number
  name: string
  bay_type: BayType
  max_length_mm?: number | null
  max_width_mm?: number | null
  max_height_mm?: number | null
  max_weight_kg?: number | null
  allow_overnight: boolean
  notes?: string | null
  supported_vehicle_classes: VehicleClass[]
}

export interface WorkshopServiceItem {
  id: number
  workshop_id: number
  name: string
  description?: string | null
  vehicle_class?: VehicleClass | null
  price_type: ServicePriceType
  hourly_rate_ore?: number | null
  fixed_price_ore?: number | null
  vat_percent?: number | null
  default_duration_min?: number | null
  is_active: boolean
}

export interface UserShort {
  id: number
  username: string
  email: string
  role: "owner" | "workshop_user"
}

export interface Workshop {
  id: number
  name: string
  email: string
  phone: string
  website?: string
  street_address: string
  postal_code: string
  city: string
  country: string
  latitude?: number
  longitude?: number
  org_number?: string
  active: boolean
  autonexo: boolean
  opening_hours?: string
  notes?: string
  users: UserShort[]
}

export interface WorkshopCreate {
  name: string
  email: string
  phone: string
  website?: string
  street_address: string
  postal_code: string
  city: string
  country: string
  latitude?: number
  longitude?: number
  org_number?: string
  active?: boolean
  autonexo?: boolean
  opening_hours?: string
  notes?: string
  user_ids?: number[]
}

export const fetchWorkshops = async (): Promise<Workshop[]> => {
  const res = await axios.get(`${WORKSHOP_ENDPOINT}/all`)
  return res.data
}

export const createWorkshop = async (workshop: WorkshopCreate): Promise<Workshop> => {
  const res = await axios.post(`${WORKSHOP_ENDPOINT}/create`, workshop)
  return res.data
}

export const updateWorkshop = async (
  workshopId: number,
  data: WorkshopCreate
): Promise<Workshop> => {
  const res = await axios.put(`${WORKSHOP_ENDPOINT}/edit/${workshopId}`, data)
  return res.data
}

export const deleteWorkshop = async (workshopId: number): Promise<void> => {
  await axios.delete(`${WORKSHOP_ENDPOINT}/delete/${workshopId}`)
}

export const fetchWorkshopById = async (workshopId: number): Promise<Workshop> => {
  const res = await axios.get(`${WORKSHOP_ENDPOINT}/${workshopId}`)
  return res.data
}

/**
 * Hämta alla bays för en verkstad
 */
export const fetchWorkshopBays = async (
  workshopId: number
): Promise<WorkshopBay[]> => {
  const res = await axios.get(`${WORKSHOP_ENDPOINT}/${workshopId}/bays`)
  return res.data
}

/**
 * Hämta alla users kopplade till en verkstad (valfritt filter på roller)
 * Ex: fetchWorkshopEmployees(123, ["workshop_employee", "workshop_user"])
 */
export const fetchWorkshopEmployees = async (
  workshopId: number,
  roles?: UserRole[]
): Promise<UserSimple[]> => {
  const res = await axios.get(`${WORKSHOP_ENDPOINT}/${workshopId}/employees`, {
    params: roles && roles.length ? { roles } : undefined, // skickas som ?roles=a&roles=b
  })
  return res.data
}

/**
 * Hämta service items för en verkstad, med valfria filter
 */
export interface ServiceItemFilters {
  is_active?: boolean
  vehicle_class?: VehicleClass
  price_type?: ServicePriceType
}

export const fetchWorkshopServiceItems = async (
  workshopId: number,
  filters?: ServiceItemFilters
): Promise<WorkshopServiceItem[]> => {
  const res = await axios.get(
    `${WORKSHOP_ENDPOINT}/${workshopId}/service-items`,
    {
      params: filters,
    }
  )
  return res.data
}

export default {
  fetchWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  fetchWorkshopById,
  fetchWorkshopEmployees,
  fetchWorkshopServiceItems,
  fetchWorkshopBays,
}
