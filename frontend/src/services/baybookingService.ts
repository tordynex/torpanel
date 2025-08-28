import axios from "@/utils/axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const BAYBOOKING_ENDPOINT = `${API_BASE}/baybooking`;

// --- Enums ---
export enum BookingStatus {
  BOOKED = "booked",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  NO_SHOW = "no_show",
}

// --- Scheman (spegel av Pydantic) ---
export interface BayBookingBase {
  workshop_id: number;
  bay_id: number;
  title: string;
  description?: string | null;
  start_at: string;                // ISO
  end_at: string;                  // ISO
  buffer_before_min?: number;
  buffer_after_min?: number;
  status?: BookingStatus;
  customer_id?: number | null;
  car_id?: number | null;
  service_log_id?: number | null;
  assigned_user_id?: number | null;
  source?: string | null;

  // valfritt om du vill bära med detta även här
  service_item_id?: number | null;

  // prisfält om du redigerar dem via CRUD
  price_net_ore?: number | null;
  price_gross_ore?: number | null;
  vat_percent?: number | null;
  price_note?: string | null;
  price_is_custom?: boolean | null;

  chain_token?: string | null;

}

export interface BayBookingCreate extends BayBookingBase {}

export interface BayBookingUpdate {
  workshop_id?: number;
  bay_id?: number;
  title?: string;
  description?: string | null;
  start_at?: string;               // ISO
  end_at?: string;                 // ISO
  buffer_before_min?: number;
  buffer_after_min?: number;
  status?: BookingStatus;
  customer_id?: number | null;
  car_id?: number | null;
  service_log_id?: number | null;
  assigned_user_id?: number | null;
  source?: string | null;

  service_item_id?: number | null;

  price_net_ore?: number | null;
  price_gross_ore?: number | null;
  vat_percent?: number | null;
  price_note?: string | null;
  price_is_custom?: boolean | null;
}

export interface BayBookingRead extends BayBookingBase {
  id: number;
  buffer_before_min: number;
  buffer_after_min: number;
  status: BookingStatus;

  service_item?: WorkshopServiceItemRead | null;

  // utfall
  final_price_ore?: number | null;
  actual_minutes_spent?: number | null;
  billed_from_time?: boolean | null;
}

export interface BayAvailabilityResult {
  available: boolean;
  reason?: string | null;
}

export interface WorkshopServiceItemRead {
  id: number;
  workshop_id: number;
  name: string;
  description?: string | null;
  vehicle_class?: string | null;
  price_type: "hourly" | "fixed";
  hourly_rate_ore?: number | null;
  fixed_price_ore?: number | null;
  vat_percent?: number | null;
  default_duration_min?: number | null;
  is_active?: boolean | null;
}

// --- Helpers ---
const toISO = (d: Date | string | undefined | null): string | undefined => {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.toISOString();
};

const buildQuery = (params: Record<string, any>): string => {
  const qp = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .flatMap(([k, v]) =>
      Array.isArray(v)
        ? v.map((vv) => `${encodeURIComponent(k)}=${encodeURIComponent(String(vv))}`)
        : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`]
    )
    .join("&");
  return qp ? `?${qp}` : "";
};

// --- API (CRUD + status/availability) ---
export const createBooking = async (data: BayBookingCreate): Promise<BayBookingRead> => {
  const res = await axios.post<BayBookingRead>(`${BAYBOOKING_ENDPOINT}/create`, data);
  return res.data;
};

export const listBookings = async (opts?: {
  workshopId?: number;
  bayId?: number;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  status?: BookingStatus[];
  includeCancelled?: boolean;
}): Promise<BayBookingRead[]> => {
  const query = buildQuery({
    workshop_id: opts?.workshopId,
    bay_id: opts?.bayId,
    date_from: toISO(opts?.dateFrom),
    date_to: toISO(opts?.dateTo),
    status: opts?.status,                 // multi
    include_cancelled: opts?.includeCancelled ?? true,
  });
  const res = await axios.get<BayBookingRead[]>(`${BAYBOOKING_ENDPOINT}/all${query}`);
  return res.data;
};

export const fetchBooking = async (bookingId: number): Promise<BayBookingRead> => {
  const res = await axios.get<BayBookingRead>(`${BAYBOOKING_ENDPOINT}/${bookingId}`);
  return res.data;
};

export const updateBooking = async (
  bookingId: number,
  data: BayBookingUpdate
): Promise<BayBookingRead> => {
  const res = await axios.put<BayBookingRead>(`${BAYBOOKING_ENDPOINT}/edit/${bookingId}`, data);
  return res.data;
};

export const deleteBooking = async (bookingId: number): Promise<void> => {
  await axios.delete(`${BAYBOOKING_ENDPOINT}/delete/${bookingId}`);
};

export const setBookingStatus = async (
  bookingId: number,
  status: BookingStatus
): Promise<BayBookingRead> => {
  const res = await axios.patch<BayBookingRead>(
    `${BAYBOOKING_ENDPOINT}/status/${bookingId}?status=${encodeURIComponent(status)}`
  );
  return res.data;
};

export const checkBayAvailability = async (params: {
  workshopId: number;
  bayId: number;
  startAt: Date | string;
  endAt: Date | string;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
}): Promise<BayAvailabilityResult> => {
  const query = buildQuery({
    workshop_id: params.workshopId,
    bay_id: params.bayId,
    start_at: toISO(params.startAt),
    end_at: toISO(params.endAt),
    buffer_before_min: params.bufferBeforeMin ?? 0,
    buffer_after_min: params.bufferAfterMin ?? 0,
  });
  const res = await axios.get<BayAvailabilityResult>(
    `${BAYBOOKING_ENDPOINT}/availability/check${query}`
  );
  return res.data;
};

export default {
  createBooking,
  listBookings,
  fetchBooking,
  updateBooking,
  deleteBooking,
  setBookingStatus,
  checkBayAvailability,
};
