import axios from "@/utils/axios";
import type { BayBookingRead } from "./baybookingService"; // typ-only import

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const BOOKINGS_ENDPOINT = `${API_BASE}/bookings`;

// --- Typer för auto-availability & auto-schedule ---

export type AssignmentStrategy = "random" | "round_robin" | "least_busy";

export interface MechanicCandidate {
  user_id: number; score: number; rank: number; reasons?: string[];
}
export interface SlotDiagnostics {
  disqualified?: MechanicCandidate[] | null;
}

export interface SlotMeta {
  recommended_user_id?: number | null;
  candidates?: MechanicCandidate[] | null;
  diagnostics?: SlotDiagnostics | null;

}

export interface AvailabilityRequest {
  workshop_id: number;
  registration_number: string;
  service_item_id: number;
  earliest_from?: string;          // ISO
  latest_end?: string;             // ISO
  prefer_user_id?: number;
  num_proposals?: number;
  interval_granularity_min?: number;
  include_buffers?: boolean;
  min_lead_time_min?: number;
  allow_fragmented_parts: boolean;

  override_duration_min?: number;

  return_candidates?: boolean;        // default true (om du vill)
  max_candidates_per_slot?: number;   // t.ex. 5
}

export interface AvailabilityProposal {
  bay_id: number;
  start_at: string;                // ISO
  end_at: string;                  // ISO
  assigned_user_id?: number | null;
  notes?: string | null;
  parts?: { start_at: string; end_at: string }[];

  meta?: SlotMeta | null;
}

export interface AvailabilityResponse {
  proposals: AvailabilityProposal[];
  reason_if_empty?: string | null;
}

export interface AutoScheduleRequest {
  workshop_id: number;
  bay_id: number;
  title: string;
  start_at: string;                // ISO
  end_at: string;                  // ISO

  // relationer
  assigned_user_id?: number | null;
  customer_id?: number | null;
  car_id?: number | null;
  registration_number?: string | null;
  service_log_id?: number | null;

  // koppling till tjänstekatalog (timpris)
  service_item_id?: number | null;

  // extra
  description?: string | null;
  buffer_before_min?: number;
  buffer_after_min?: number;
  source?: string | null;

  // pris (öre)
  price_net_ore?: number | null;
  price_gross_ore?: number | null;
  vat_percent?: number | null;
  price_note?: string | null;
  price_is_custom?: boolean | null;

  chain_token?: string | null;
}

// Slutför med faktisk tid + ev. timdebitering
export interface CompleteWithTimeRequest {
  actual_minutes_spent: number;    // t.ex. 75
  charge_more_than_estimate: boolean;
  use_custom_final_price?: boolean;
  custom_final_price_ore?: number | null;
  phone_override_e164?: string | null;
}

// --- API ---

/** Hämta 1–N lediga tider (auto) */
export const fetchAutoAvailability = async (
  data: AvailabilityRequest
): Promise<AvailabilityResponse> => {
  const res = await axios.post(`${BOOKINGS_ENDPOINT}/availability/auto`, data);
  return res.data;
};

/** Skapa bokning från auto-förslag/manuell slot */
export const autoScheduleBooking = async (
  data: AutoScheduleRequest
): Promise<BayBookingRead> => {
  const res = await axios.post(`${BOOKINGS_ENDPOINT}/auto-schedule`, data);
  return res.data;
};

/** Markera som klar med faktisk tid (+ ev. debitera tid × timpris) */
export const completeBookingWithTime = async (
  bookingId: number,
  data: CompleteWithTimeRequest
): Promise<BayBookingRead> => {
  const res = await axios.post(
    `${BOOKINGS_ENDPOINT}/${bookingId}/complete-with-time`,
    data
  );
  return res.data;
};

export default {
  fetchAutoAvailability,
  autoScheduleBooking,
  completeBookingWithTime,
};
