import axios from "axios"

const API_BASE = import.meta.env.VITE_API_BASE_URL
const NEWS_ENDPOINT = `${API_BASE}/news`

export interface News {
  id: number
  title: string
  content: string
  /** ISO date string, t.ex. "2025-09-28" */
  date: string
}

export interface NewsCreate {
  title: string
  content: string
  /** ISO date string, t.ex. "2025-09-28" */
  date: string
}

export const createNews = async (data: NewsCreate): Promise<News> => {
  const res = await axios.post(`${NEWS_ENDPOINT}/create`, data)
  return res.data
}

export const fetchAllNews = async (): Promise<News[]> => {
  const res = await axios.get(`${NEWS_ENDPOINT}/all`)
  return res.data
}

export const fetchNewsById = async (newsId: number): Promise<News> => {
  const res = await axios.get(`${NEWS_ENDPOINT}/${newsId}`)
  return res.data
}

export const updateNews = async (newsId: number, data: NewsCreate): Promise<News> => {
  const res = await axios.put(`${NEWS_ENDPOINT}/edit/${newsId}`, data)
  return res.data
}

export const deleteNews = async (newsId: number): Promise<void> => {
  await axios.delete(`${NEWS_ENDPOINT}/delete/${newsId}`)
}

export default {
  createNews,
  fetchAllNews,
  fetchNewsById,
  updateNews,
  deleteNews,
}
