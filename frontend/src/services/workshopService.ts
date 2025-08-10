import axios from "axios"

const API_BASE = "http://localhost:8000"
const WORKSHOP_ENDPOINT = `${API_BASE}/workshops`

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

export default {
  fetchWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  fetchWorkshopById,
}
