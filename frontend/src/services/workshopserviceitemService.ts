import api from "@/utils/api"

const WORKSHOP_SERVICE_ITEM_ENDPOINT = "/workshop-service-items"

// Håll dessa breda eller definiera riktiga unioner som matchar backend (lowercase)
export type VehicleClass = string | null
export type PriceType = "hourly" | "fixed" | string

export interface WorkshopServiceItem {
  id: number
  workshop_id: number
  name: string
  description?: string | null
  vehicle_class: VehicleClass
  price_type: PriceType
  hourly_rate_ore?: number | null
  fixed_price_ore?: number | null
  vat_percent?: number | null
  default_duration_min?: number | null
  is_active: boolean
  created_at?: string
  updated_at?: string
  request_only: boolean
}

export interface WorkshopServiceItemCreate {
  workshop_id: number
  name: string
  description?: string | null
  vehicle_class: VehicleClass        // ← kan vara null = “Alla fordon”
  price_type: PriceType              // ← “hourly” | “fixed”
  hourly_rate_ore?: number | null
  fixed_price_ore?: number | null
  vat_percent?: number | null
  default_duration_min?: number | null
  is_active?: boolean
  request_only: boolean
}

export interface WorkshopServiceItemUpdate {
  name?: string
  description?: string | null
  vehicle_class?: VehicleClass
  price_type?: PriceType
  hourly_rate_ore?: number | null
  fixed_price_ore?: number | null
  vat_percent?: number | null
  default_duration_min?: number | null
  is_active?: boolean
  request_only?: boolean
}

export interface ListParams {
  q?: string
  active?: boolean
  vehicle_class?: Exclude<VehicleClass, null> // filtrering skickar specifik klass (null hanteras i backend)
}

export const createServiceItem = async (
  data: WorkshopServiceItemCreate
): Promise<WorkshopServiceItem> => {
  const res = await api.post(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/create`, data)
  return res.data
}

export const listServiceItemsForWorkshop = async (
  workshopId: number,
  params?: ListParams
): Promise<WorkshopServiceItem[]> => {
  const res = await api.get(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/public/workshop/${workshopId}`, {
    params,
  })
  return res.data
}

export const getServiceItem = async (itemId: number): Promise<WorkshopServiceItem> => {
  const res = await api.get(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/${itemId}`)
  return res.data
}

export const updateServiceItem = async (
  itemId: number,
  data: WorkshopServiceItemUpdate
): Promise<WorkshopServiceItem> => {
  const res = await api.put(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/${itemId}`, data)
  return res.data
}

export const toggleServiceItemActive = async (
  itemId: number
): Promise<WorkshopServiceItem> => {
  const res = await api.post(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/${itemId}/toggle-active`)
  return res.data
}

export const deleteServiceItem = async (itemId: number): Promise<void> => {
  await api.delete(`${WORKSHOP_SERVICE_ITEM_ENDPOINT}/${itemId}`)
}

export default {
  createServiceItem,
  listServiceItemsForWorkshop,
  getServiceItem,
  updateServiceItem,
  toggleServiceItemActive,
  deleteServiceItem,
}
