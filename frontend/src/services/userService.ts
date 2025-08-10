import axios from "axios"

const API_BASE = "http://localhost:8000"
const USER_ENDPOINT = `${API_BASE}/users`

export interface User {
  id: number
  username: string
  email: string
  role: "owner" | "workshop_user"
  workshops?: {
    id: number
    name: string
    city?: string
    email: string
  }[]
}

export interface UserCreate {
  username: string
  email: string
  password: string
  role: "owner" | "workshop_user"
  workshop_ids?: number[]
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

export const fetchUsers = async (): Promise<User[]> => {
  const res = await axios.get(`${USER_ENDPOINT}/all`)
  return res.data
}

export const fetchCurrentUser = async (): Promise<User> => {
  const token = localStorage.getItem("token")
  if (!token) throw new Error("Ingen token")

  const res = await axios.get(`${USER_ENDPOINT}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return res.data
}

export const createUser = async (user: UserCreate): Promise<User> => {
  const res = await axios.post(`${USER_ENDPOINT}/create`, user)
  return res.data
}

export const deleteUser = async (userId: number): Promise<void> => {
  await axios.delete(`${USER_ENDPOINT}/delete/${userId}`)
}

export const updateUser = async (userId: number, user: UserCreate): Promise<User> => {
  const res = await axios.put(`${USER_ENDPOINT}/edit/${userId}`, user)
  return res.data
}

export const login = async (
  email: string,
  password: string
): Promise<LoginResponse> => {
  const params = new URLSearchParams()
  params.append("username", email)
  params.append("password", password)

  const res = await axios.post(`${USER_ENDPOINT}/login`, params, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })

  return res.data
}

export const logout = () => {
  localStorage.removeItem("token")
}

// 🆕 Glömt lösenord – begär återställningslänk
export const requestPasswordReset = async (email: string): Promise<void> => {
  await axios.post(`${USER_ENDPOINT}/reset-password-request`, { email })
}

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  await axios.post(`${USER_ENDPOINT}/reset-password`, {
    token,
    new_password: newPassword,
  })
}

export default {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  login,
  logout,
  fetchCurrentUser,
  requestPasswordReset,
  resetPassword,
}
