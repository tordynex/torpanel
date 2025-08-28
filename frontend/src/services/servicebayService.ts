import axios from "@/utils/axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const SERVICEBAY_ENDPOINT = `${API_BASE}/servicebay`

// Enums speglar backend (models.BayType / models.VehicleClass)
export enum BayType {
  TWO_POST_LIFT = "two_post_lift",
  FOUR_POST_LIFT = "four_post_lift",
  FLOOR_SPACE = "floor_space",
  ALIGNMENT_RACK = "alignment_rack",
  DIAGNOSIS = "diagnosis",
  MOT_BAY = "mot_bay",
}

export enum VehicleClass {
  MOTORCYCLE = "motorcycle",
  SMALL_CAR = "small_car",
  SEDAN = "sedan",
  SUV = "suv",
  VAN = "van",
  PICKUP = "pickup",
  LIGHT_TRUCK = "light_truck",
}

// ---------- Interfaces speglar dina Pydantic-scheman ----------

export interface WorkshopBayBase {
  name: string
  bay_type: BayType
  max_length_mm?: number | null
  max_width_mm?: number | null
  max_height_mm?: number | null
  max_weight_kg?: number | null
  allow_overnight?: boolean
  notes?: string | null
  // När vi skapar/uppdaterar skickar vi in vilka klasser platsen tillåter
  vehicle_classes?: VehicleClass[] | null
}

export interface WorkshopBayCreate extends WorkshopBayBase {
  workshop_id: number
}

export interface WorkshopBayUpdate {
  name?: string
  bay_type?: BayType
  max_length_mm?: number | null
  max_width_mm?: number | null
  max_height_mm?: number | null
  max_weight_kg?: number | null
  allow_overnight?: boolean
  notes?: string | null
  vehicle_classes?: VehicleClass[] | null
}

export interface WorkshopBayReadSimple {
  id: number
  workshop_id: number
  name: string
  bay_type: BayType
}

export interface WorkshopBayRead extends WorkshopBayReadSimple {
  max_length_mm?: number | null
  max_width_mm?: number | null
  max_height_mm?: number | null
  max_weight_kg?: number | null
  allow_overnight: boolean
  notes?: string | null
  // Detta fält kommer från backend (read-schema) och visar vad platsen faktiskt stödjer
  supported_vehicle_classes: VehicleClass[]
}

// ---------- API-funktioner ----------

export const createBay = async (
  data: WorkshopBayCreate
): Promise<WorkshopBayRead> => {
  const res = await axios.post<WorkshopBayRead>(`${SERVICEBAY_ENDPOINT}/create`, data)
  return res.data
}

export const fetchAllBays = async (
  workshopId?: number
): Promise<WorkshopBayReadSimple[]> => {
  const url =
    workshopId != null
      ? `${SERVICEBAY_ENDPOINT}/all?workshop_id=${encodeURIComponent(workshopId)}`
      : `${SERVICEBAY_ENDPOINT}/all`
  const res = await axios.get<WorkshopBayReadSimple[]>(url)
  return res.data
}

export const fetchBay = async (bayId: number): Promise<WorkshopBayRead> => {
  const res = await axios.get<WorkshopBayRead>(`${SERVICEBAY_ENDPOINT}/${bayId}`)
  return res.data
}

export const updateBay = async (
  bayId: number,
  data: WorkshopBayUpdate
): Promise<WorkshopBayRead> => {
  const res = await axios.put<WorkshopBayRead>(
    `${SERVICEBAY_ENDPOINT}/edit/${bayId}`,
    data
  )
  return res.data
}

export const deleteBay = async (bayId: number): Promise<void> => {
  await axios.delete(`${SERVICEBAY_ENDPOINT}/delete/${bayId}`)
}

export default {
  createBay,
  fetchAllBays,
  fetchBay,
  updateBay,
  deleteBay,
}
