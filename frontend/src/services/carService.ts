import axios from "axios"
import type { ServiceLog } from "./servicelogService"

const API_BASE = "http://localhost:8000"
const CAR_ENDPOINT = `${API_BASE}/cars`

export interface Car {
  id: number
  registration_number: string
  brand: string
  model_year: number
  service_logs: ServiceLog[]
}

export interface CarCreate {
  registration_number: string
  brand: string
  model_year: number
}

export const createCar = async (data: CarCreate): Promise<Car> => {
  const res = await axios.post(`${CAR_ENDPOINT}/create`, data)
  return res.data
}

export const fetchAllCars = async (): Promise<Car[]> => {
  const res = await axios.get(`${CAR_ENDPOINT}/all`)
  return res.data
}

export const fetchCarById = async (carId: number): Promise<Car> => {
  const res = await axios.get(`${CAR_ENDPOINT}/${carId}`)
  return res.data
}

export const fetchCarByReg = async (regNumber: string): Promise<Car> => {
  const res = await axios.get(`${CAR_ENDPOINT}/reg/${regNumber}`)
  return res.data
}

export const updateCar = async (carId: number, data: CarCreate): Promise<Car> => {
  const res = await axios.put(`${CAR_ENDPOINT}/edit/${carId}`, data)
  return res.data
}

export const deleteCar = async (carId: number): Promise<void> => {
  await axios.delete(`${CAR_ENDPOINT}/delete/${carId}`)
}

export default {
  createCar,
  fetchAllCars,
  fetchCarById,
  fetchCarByReg,
  updateCar,
  deleteCar,
}