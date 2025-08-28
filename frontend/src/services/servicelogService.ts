import axios from "@/utils/axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const SERVICELOG_ENDPOINT = `${API_BASE}/servicelogs`

export interface ServiceTask {
  id: number
  title: string
  comment: string
}

export interface ServiceLog {
  id: number
  work_performed: string
  date: string
  mileage: number
  workshop_id: number
  tasks: ServiceTask[]
}

export interface ServiceLogCreate {
  work_performed: string
  date: string
  mileage: number
  car_id: number
  tasks: ServiceTask[]
}

export interface ServiceLogUpdate {
  work_performed?: string
  date?: string
  mileage?: number
  workshop_id?: number
  tasks?: Omit<ServiceTask, "id">[]
}

export const createLog = async (data: ServiceLogCreate): Promise<ServiceLog> => {
  const res = await axios.post<ServiceLog>(`${SERVICELOG_ENDPOINT}/create`, data)
  return res.data
}

export const fetchAllLogs = async (): Promise<ServiceLog[]> => {
  const res = await axios.get<ServiceLog[]>(`${SERVICELOG_ENDPOINT}/all`)
  return res.data
}

export const fetchLogsForCar = async (carId: number): Promise<ServiceLog[]> => {
  const res = await axios.get<ServiceLog[]>(`${SERVICELOG_ENDPOINT}/car/${carId}`)
  return res.data
}

export const updateLog = async (
  logId: number,
  data: ServiceLogUpdate
): Promise<ServiceLog> => {
  const res = await axios.put<ServiceLog>(`${SERVICELOG_ENDPOINT}/${logId}`, data)
  return res.data
}

export const deleteLog = async (logId: number): Promise<void> => {
  await axios.delete(`${SERVICELOG_ENDPOINT}/${logId}`)
}

export default {
  createLog,
  fetchAllLogs,
  fetchLogsForCar,
  updateLog,
  deleteLog,
}
