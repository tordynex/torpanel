import axios from "@/utils/axios"
import type { BayBookingRead } from "@/services/baybookingService";

const API_BASE = import.meta.env.VITE_API_BASE_URL
const USER_ENDPOINT = `${API_BASE}/users`

export type UserRole = "owner" | "workshop_user" | "workshop_employee"

// --- Nytt: typer för schema & frånvaro ---
export interface UserWorkingHours {
  id: number
  user_id: number
  weekday: number        // 0=mån ... 6=sön
  start_time: string     // "08:00:00"
  end_time: string       // "17:00:00"
  valid_from?: string | null // "2025-09-01"
  valid_to?: string | null   // "2025-12-31"
}

export interface UserWorkingHoursCreate {
  user_id: number
  weekday: number
  start_time: string
  end_time: string
  valid_from?: string | null
  valid_to?: string | null
}

export interface UserWorkingHoursUpdate {
  weekday?: number
  start_time?: string
  end_time?: string
  valid_from?: string | null
  valid_to?: string | null
}

export type TimeOffType = "vacation" | "sick" | "training" | "other"

export interface UserTimeOff {
  id: number
  user_id: number
  start_at: string       // ISO med TZ, ex "2025-08-20T08:00:00Z"
  end_at: string
  type: TimeOffType
  reason?: string | null
}

export interface UserTimeOffCreate {
  user_id: number
  start_at: string       // ISO med TZ
  end_at: string         // ISO med TZ
  type?: TimeOffType
  reason?: string | null
}

export interface UserTimeOffUpdate {
  start_at?: string
  end_at?: string
  type?: TimeOffType
  reason?: string | null
}

export interface WorkshopRef {
  id: number
  name: string
  city?: string
  email: string
}

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  workshops?: WorkshopRef[]
}

export interface UserCreate {
  username: string
  email: string
  password: string
  role: UserRole
  workshop_ids?: number[]
}

export interface UserUpdate {
  // PATCH: allt valfritt; backend avgör vad som får uppdateras
  username?: string
  email?: string
  password?: string
  role?: UserRole
  workshop_ids?: number[]
}

export type LoginResponse = { access_token: string; token_type: string }

export interface LunchPresetRequest {
  weekdays?: number[];        // default: [0,1,2,3,4] (mån–fre)
  start_time?: string;        // "08:00:00"
  lunch_start?: string;       // "12:00:00"
  lunch_end?: string;         // "13:00:00"
  end_time?: string;          // "17:00:00"
  valid_from?: string | null; // "2025-09-01"
  valid_to?: string | null;   // "2025-12-31"
}

// ---- Typer för /schedule-svaret ----
export interface ScheduleWorkingBlock {
  start_local: string; // ISO med tz
  end_local: string;
  start_utc: string;   // ISO i UTC
  end_utc: string;
}

export interface ScheduleTimeOff {
  type: TimeOffType;        // "vacation" | "sick" | "training" | "other"
  reason?: string | null;
  start_utc: string;
  end_utc: string;
  start_local: string;
  end_local: string;
}

/** Minimal klippad bokningsrepresentation som /schedule returnerar (ej full BayBookingRead) */
export interface ScheduleBookingClip {
  id: number;
  title: string;
  status: "booked" | "in_progress" | "completed" | "cancelled" | "no_show";
  workshop_id: number;
  bay_id: number;
  start_utc: string;
  end_utc: string;
  start_local: string;
  end_local: string;
  customer_id?: number | null;
  car_id?: number | null;
  service_item_id?: number | null;
  assigned_user_id?: number | null;
}

export interface UserScheduleDay {
  date: string; // "YYYY-MM-DD"
  working_blocks: ScheduleWorkingBlock[];
  time_off: ScheduleTimeOff[];
  bookings: ScheduleBookingClip[]; // tom array om include_bookings=false
}

export interface UserScheduleResponse {
  user_id: number;
  tz: string;     // ex "Europe/Stockholm"
  from: string;   // "YYYY-MM-DD"
  to: string;     // "YYYY-MM-DD"
  days: UserScheduleDay[];
}

/** Axios-instans med token-injektion */
const client = client.create({
  baseURL: USER_ENDPOINT,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    }
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    // valfritt: auto-logout vid 401
    if (err?.response?.status === 401) {
      // localStorage.removeItem("token")
    }
    return Promise.reject(err)
  }
)

/** Users */
export const fetchUsers = async () => {
  const { data } = await client.get(`${USER_ENDPOINT}/all`)
  return data
}

export const fetchCurrentUser = async () => {
  const { data } = await client.get(`${USER_ENDPOINT}/me`)
  return data
}

export const createUser = async (payload: UserCreate) => {
  const { data } = await client.post(`${USER_ENDPOINT}/create`, payload)
  return data
}

export const deleteUser = async (userId: number) => {
  await client.delete(`${USER_ENDPOINT}/delete/${userId}`)
}

export const updateUser = async (userId: number, payload: UserUpdate) => {
  const { data } = await client.put(`${USER_ENDPOINT}/edit/${userId}`, payload)
  return data
}

/** Auth */
export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const params = new URLSearchParams()
  params.append("username", email)
  params.append("password", password)

  const { data } = await client.post(`${USER_ENDPOINT}/login`, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })

  return data
}

export const logout = async () => {
  try {
    await client.post(`${USER_ENDPOINT}/logout`)
  } finally {
    localStorage.removeItem("currentUser")
    localStorage.removeItem("currentWorkshop")
  }
}

/** Lösenordsflöde */
export const requestPasswordReset = async (email: string) => {
  await client.post(`${USER_ENDPOINT}/reset-password-request`, { email })
}

export const resetPassword = async (token: string, newPassword: string) => {
  await client.post(`${USER_ENDPOINT}/reset-password`, { token, new_password: newPassword })
}

// --- Nytt: services för arbetstider ---
export const createWorkingHours = async (userId: number, payload: UserWorkingHoursCreate) => {
  const { data } = await client.post(`${USER_ENDPOINT}/users/${userId}/working-hours`, payload)
  return data
}

export const listWorkingHours = async (userId: number) => {
  const { data } = await client.get(`${USER_ENDPOINT}/users/${userId}/working-hours`)
  return data
}

export const updateWorkingHours = async (workingHoursId: number, payload: UserWorkingHoursUpdate) => {
  const { data } = await client.patch(`${USER_ENDPOINT}/working-hours/${workingHoursId}`, payload)
  return data
}

export const deleteWorkingHours = async (workingHoursId: number) => {
  await client.delete(`${USER_ENDPOINT}/working-hours/${workingHoursId}`)
}
export const setOfficeHours = async (userId: number) => {
  const { data } = await client.post(`${USER_ENDPOINT}/users/${userId}/working-hours/preset/office`)
  return data
}

export const createTimeOff = async (userId: number, payload: UserTimeOffCreate) => {
  const { data } = await client.post(`${USER_ENDPOINT}/users/${userId}/time-off`, payload)
  return data
}
export const listTimeOff = async (userId: number) => {
  const { data } = await client.get(`${USER_ENDPOINT}/users/${userId}/time-off`)
  return data
}
export const updateTimeOff = async (timeOffId: number, payload: UserTimeOffUpdate) => {
  const { data } = await client.patch(`${USER_ENDPOINT}/time-off/${timeOffId}`, payload)
  return data
}
export const deleteTimeOff = async (timeOffId: number) => {
  await client.delete(`${USER_ENDPOINT}/time-off/${timeOffId}`)
}

export const setWorkingHoursWithLunch = async (
  userId: number,
  payload: LunchPresetRequest = {}
) => {
  const { data } = await client.post(
    `${USER_ENDPOINT}/users/${userId}/working-hours/preset/with-lunch`,
    payload
  )
  return data
}

export const listUserBookingsWindow = async (
  userId: number,
  dateFromISO: string,
  dateToISO: string
): Promise<BayBookingRead[]> => {
  const { data } = await client.get(`${USER_ENDPOINT}/${userId}/bookings`, {
    params: {
      date_from: dateFromISO,
      date_to: dateToISO,
      include: "car,customer,car_primary_customer,service_item",
    },
  });
  return data as BayBookingRead[];
};

export const loadBookingsForUser = (
  userId: number,
  fromISO: string,
  toISO: string
) => listUserBookingsWindow(userId, fromISO, toISO)

export const getUserScheduleWindow = async (args: {
  userId: number
  dayFrom: string    // "YYYY-MM-DD"
  dayTo: string      // "YYYY-MM-DD"
  includeBookings?: boolean
  tz?: string        // default "Europe/Stockholm"
}): Promise<UserScheduleResponse> => {
  const { userId, dayFrom, dayTo, includeBookings = false, tz = "Europe/Stockholm" } = args
  const { data } = await client.get(`${USER_ENDPOINT}/${userId}/schedule`, {
    params: {
      day_from: dayFrom,
      day_to: dayTo,
      include_bookings: includeBookings,
      tz,
    },
  })
  return data as UserScheduleResponse
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
  listWorkingHours,
  updateWorkingHours,
  deleteWorkingHours,
  setOfficeHours,
  createTimeOff,
  listTimeOff,
  updateTimeOff,
  deleteTimeOff,
  createWorkingHours,
  setWorkingHoursWithLunch,
  listUserBookingsWindow,
  loadBookingsForUser,
  getUserScheduleWindow,
}
