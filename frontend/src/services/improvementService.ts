import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const ENDPOINT = `${API_BASE}/improvement`

export interface SuggestPayload {
  message: string
  sender_email?: string
  sender_name?: string
  page?: string
  app_version?: string
}

export const suggestImprovement = async (data: SuggestPayload) => {
  const res = await axios.post(`${ENDPOINT}/suggest`, data)
  return res.data
}
