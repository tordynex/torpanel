import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiInbox,
  FiCheckCircle,
  FiRefreshCcw,
  FiSearch,
  FiPhone,
  FiMail,
  FiUser,
  FiCalendar,
  FiExternalLink,
  FiAlertCircle,
  FiTag,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";

import { useWorkshop } from "@/hooks/useWorkshops";
import {
  fetchBookingRequestsForWorkshop,
  updateBookingRequest,
  type BookingRequest,
  type BookingRequestStatus,
} from "@/services/bookingrequestsService";

import {
  fetchCustomerById,
  fetchPrimaryCustomerForCar,
  type Customer,
} from "@/services/crmService";

import {
  getServiceItem,
  type WorkshopServiceItem,
} from "@/services/workshopserviceitemService";

import styles from "./css/BookingRequests.module.css";

type TabKey = "open" | "handled" | "converted_to_booking";

/* ---------- helpers ---------- */

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const rtf = new Intl.RelativeTimeFormat("sv-SE", { numeric: "auto" });
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = then - now;
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);
  if (absMin < 60) return rtf.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, "hour");
  const diffD = Math.round(diffH / 24);
  return rtf.format(diffD, "day");
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Extrahera ev. lista med service_item_id från message + önskad dag */
function parseFromMessage(msg?: string | null): {
  serviceItemIds?: number[];
  desiredDateISO?: string;
} {
  if (!msg) return {};
  const out: { serviceItemIds?: number[]; desiredDateISO?: string } = {};

  // "Valda service_item_id: 12, 34, 56" eller "Valda service_item_ids: ..."
  const idsMatch = msg.match(/Valda\s+service_item_id(?:s)?:\s*([0-9,\s]+)/i);
  if (idsMatch?.[1]) {
    const ids = idsMatch[1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (ids.length) out.serviceItemIds = Array.from(new Set(ids));
  }

  const dateMatch = msg.match(/Önskad\s+inlämningsdag:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (dateMatch?.[1]) {
    const d = new Date(dateMatch[1] + "T00:00:00");
    out.desiredDateISO = d.toISOString();
  }

  return out;
}

/** Ta bort raden "Valda service_item_id..." ur meddelandet */
function sanitizeMessage(msg?: string | null): string {
  if (!msg) return "";
  return msg
    .split(/\r?\n/)
    .filter((line) => !/^\s*Valda\s+service_item_id/i.test(line))
    .join("\n")
    .trim();
}

/** Kort förhandsvisning av meddelandet (en rad) */
function previewMessage(msg?: string | null, max = 140): string {
  const clean = sanitizeMessage(msg).replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/* ---------- komponent ---------- */

type EnrichedBooking = BookingRequest & {
  _customer?: Customer | null;
  _serviceItems?: WorkshopServiceItem[];
  _desiredDateISO?: string;
};

export default function BookingRequests() {
  const workshop = useWorkshop();
  const workshopId = workshop?.id;
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("open");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<EnrichedBooking[]>([]);
  const [error, setError] = useState<string | null>(null);

  // vilka kort är expanderade
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchData = async () => {
    if (!workshopId) return;
    setLoading(true);
    setError(null);
    try {
      const opts: Parameters<typeof fetchBookingRequestsForWorkshop>[1] = {
        status: tab as BookingRequestStatus,
      };
      if (from) opts.created_from = new Date(from);
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        opts.created_to = d;
      }

      const raw = (await fetchBookingRequestsForWorkshop(workshopId, opts)) || [];

      // Enrichment: hämta kund + serviceitems i batch (unika ids)
      const uniqueCustomerIds = Array.from(
        new Set(raw.map((r) => r.customer_id).filter((x): x is number => !!x))
      );

      // samla alla service item ids (från backend-lista om finns, annars single+message)
      const allIds: number[] = [];
      for (const r of raw) {
        if (Array.isArray((r as any).service_items) && (r as any).service_items.length) {
          for (const si of (r as any).service_items) {
            if (si?.id) allIds.push(si.id);
          }
        } else {
          const parsed = parseFromMessage(r.message);
          const ids = [r.service_item_id, ...(parsed.serviceItemIds ?? [])].filter(
            (x): x is number => !!x
          );
          allIds.push(...ids);
        }
      }
      const uniqueServiceItemIds = Array.from(new Set(allIds));

      // hämta kunder
      const customerMap = new Map<number, Customer>();
      await Promise.all(
        uniqueCustomerIds.map(async (id) => {
          try {
            const c = await fetchCustomerById(id);
            if (c) customerMap.set(id, c);
          } catch {
            /* ignore */
          }
        })
      );

      // hämta serviceitems
      const serviceItemMap = new Map<number, WorkshopServiceItem>();
      await Promise.all(
        uniqueServiceItemIds.map(async (id) => {
          try {
            const si = await getServiceItem(id);
            if (si) serviceItemMap.set(id, si);
          } catch {
            /* ignore */
          }
        })
      );

      const enriched: EnrichedBooking[] = await Promise.all(
        raw.map(async (r) => {
          const parsed = parseFromMessage(r.message);

          // ID-lista per request
          let ids: number[] = [];
          if (Array.isArray((r as any).service_items) && (r as any).service_items.length) {
            ids = (r as any).service_items.map((si: any) => si.id).filter((x: any) => !!x);
          } else {
            ids = [r.service_item_id, ...(parsed.serviceItemIds ?? [])].filter(
              (x): x is number => !!x
            );
          }
          ids = Array.from(new Set(ids));

          // Kund
          let customer: Customer | null | undefined =
            (r.customer_id ? customerMap.get(r.customer_id) : undefined) ?? null;

          if (!customer && r.car_id) {
            try {
              customer = await fetchPrimaryCustomerForCar(r.car_id, workshopId);
            } catch {
              /* ignore */
            }
          }

          // Items
          const serviceItems: WorkshopServiceItem[] = ids
            .map((id) => serviceItemMap.get(id))
            .filter((x): x is WorkshopServiceItem => !!x);

          return {
            ...r,
            _customer: customer,
            _serviceItems: serviceItems,
            _desiredDateISO: parsed.desiredDateISO,
          };
        })
      );

      setList(enriched);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte hämta bokningsförfrågningar.");
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId, tab, from, to]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((r) => {
      const customerName = [
        r._customer?.first_name ?? r.first_name ?? "",
        r._customer?.last_name ?? r.last_name ?? "",
      ].join(" ");
      const serviceNames = (r._serviceItems ?? []).map((si) => si.name).join(" ");
      const hay = [
        customerName,
        r._customer?.email ?? r.email ?? "",
        r._customer?.phone ?? r.phone ?? "",
        r.registration_number ?? "",
        sanitizeMessage(r.message) ?? "",
        serviceNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [list, q]);

  // Antal i nuvarande lista (för aktiva fliken – servern filtrerar redan på status)
  const counts = useMemo(() => {
    const base = { open: 0, handled: 0, converted_to_booking: 0 };
    for (const r of list) {
      if (r.status === "open") base.open++;
      if (r.status === "handled") base.handled++;
      if (r.status === "converted_to_booking") base.converted_to_booking++;
    }
    return base;
  }, [list]);

  const setStatus = async (id: number, status: BookingRequestStatus) => {
    try {
      await updateBookingRequest(id, { status });
      // optimistisk uppdatering
      setList((prev) => prev.map((x) => (x.id === id ? ({ ...x, status } as EnrichedBooking) : x)));
      // om status byter bort från aktuell tab, filtrera bort lokalt
      if (status !== tab) {
        setList((prev) => prev.filter((x) => x.id !== id));
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kunde inte uppdatera status.");
    }
  };

  const goToBookingCalendar = () => {
    navigate("/workshop/calendar");
  };

  return (
    <section className={styles.brCard}>
      <div className={styles.brHeader}>
        <div className={styles.brTitle}>
          <FiInbox aria-hidden /> Bokningsförfrågningar
        </div>
        <div className={styles.brActions}>
          <button
            className={cx(styles.brBtn, styles.brBtnGhost)}
            onClick={fetchData}
            disabled={loading || !workshopId}
            title="Uppdatera"
          >
            <FiRefreshCcw aria-hidden /> Uppdatera
          </button>
        </div>
      </div>

      {/* Filterbar */}
      <div className={styles.brToolbar}>
        <div className={styles.brTabs} role="tablist" aria-label="Status-filter">
          <button
            role="tab"
            aria-selected={tab === "open"}
            className={cx(styles.brTab, tab === "open" && styles.isActive)}
            onClick={() => setTab("open")}
          >
            Öppna {counts.open ? <span className={styles.brPill}>{counts.open}</span> : null}
          </button>
          <button
            role="tab"
            aria-selected={tab === "handled"}
            className={cx(styles.brTab, tab === "handled" && styles.isActive)}
            onClick={() => setTab("handled")}
          >
            Hanterade {counts.handled ? <span className={styles.brPill}>{counts.handled}</span> : null}
          </button>
          <button
            role="tab"
            aria-selected={tab === "converted_to_booking"}
            className={cx(styles.brTab, tab === "converted_to_booking" && styles.isActive)}
            onClick={() => setTab("converted_to_booking")}
          >
            Konverterade{" "}
            {counts.converted_to_booking ? <span className={styles.brPill}>{counts.converted_to_booking}</span> : null}
          </button>
        </div>

        <div className={styles.brFilters}>
          <div className={styles.brSearch}>
            <FiSearch aria-hidden />
            <input
              placeholder="Sök förfrågningar… (namn, e‑post, telefon, regnr, meddelande, tjänst)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Valfritt: datumfilter UI (använder from/to redan i state) */}
          {/* <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /> */}
        </div>
      </div>

      {/* Status / errors */}
      {error && (
        <div className={styles.brAlert} role="alert">
          <FiAlertCircle aria-hidden /> {error}
        </div>
      )}

      {/* Lista */}
      <div className={styles.brList}>
        {loading ? (
          <div className={styles.brSkeletonList}>
            <div className={styles.brSkeleton} />
            <div className={styles.brSkeleton} />
            <div className={styles.brSkeleton} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.brEmpty}>
            Inga förfrågningar att visa {tab === "open" ? "just nu." : "för valt filter."}
          </div>
        ) : (
          filtered.map((r) => {
            const displayFirst = (r._customer?.first_name ?? r.first_name ?? "") || "";
            const displayLast = (r._customer?.last_name ?? r.last_name ?? "") || "";
            const displayName = (displayFirst + " " + displayLast).trim() || "—";
            const email = r._customer?.email ?? r.email ?? "—";
            const phone = r._customer?.phone ?? r.phone ?? "—";
            const desiredDate = r._desiredDateISO ? formatDateTime(r._desiredDateISO) : "—";

            const isOpen = expanded.has(r.id);
            const cleanMsg = sanitizeMessage(r.message);
            const preview = previewMessage(r.message);

            return (
              <article key={r.id} className={cx(styles.brItem, isOpen && styles.isOpen)}>
                {/* Header */}
                <header className={styles.brItemHeader}>
                  <div className={styles.brId}>#{r.id}</div>
                  <div className={styles.brTime} title={formatDateTime(r.created_at)}>
                    {relativeTime(r.created_at)}
                  </div>
                </header>

                {/* Kompakt rad (alltid synlig) */}
                <button
                  className={cx(styles.brRowCompact)}
                  onClick={() => toggleExpand(r.id)}
                  aria-expanded={isOpen}
                  aria-controls={`br-details-${r.id}`}
                  title={isOpen ? "Dölj detaljer" : "Visa detaljer"}
                >
                  <div className={styles.brCompactLeft}>
                    <span className={styles.brCompactName}>{displayName}</span>
                    <span className={styles.brCompactSep}>•</span>
                    <span className={styles.brCompactReg}>{r.registration_number || "—"}</span>
                    <span className={styles.brCompactSep}>•</span>
                    <span className={styles.brCompactMsg}>{preview}</span>
                  </div>

                  <div className={styles.brCompactRight}>
                    <span
                      className={cx(
                        styles.brStatus,
                        (styles as any)[`brStatus--${r.status}`]
                      )}
                    >
                      {r.status === "open" && "Öppen"}
                      {r.status === "handled" && "Hanterad"}
                      {r.status === "converted_to_booking" && "Konverterad"}
                    </span>
                    <span className={styles.brExpandIcon} aria-hidden>
                      {isOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </span>
                  </div>
                </button>

                {/* Detaljer (expanderas) */}
                <div
                  id={`br-details-${r.id}`}
                  className={cx(styles.brItemBody, styles.brCollapsible, isOpen ? styles.open : styles.closed)}
                >
                  <div className={styles.brCol}>
                    <div className={styles.brRow}>
                      <FiUser aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>Namn</div>
                        <div className={styles.brV}>{displayName}</div>
                      </div>
                    </div>

                    <div className={styles.brRow}>
                      <FiPhone aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>Telefon</div>
                        <div className={styles.brV}>{phone}</div>
                      </div>
                    </div>

                    <div className={styles.brRow}>
                      <FiMail aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>E‑post</div>
                        <div className={styles.brV}>{email}</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.brCol}>
                    <div className={styles.brRow}>
                      <FiCalendar aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>Registreringsnummer</div>
                        <div className={styles.brV}>{r.registration_number || "—"}</div>
                      </div>
                    </div>

                    <div className={styles.brRow}>
                      <FiInbox aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>Status</div>
                        <div
                          className={cx(
                            styles.brStatus,
                            (styles as any)[`brStatus--${r.status}`]
                          )}
                        >
                          {r.status === "open" && "Öppen"}
                          {r.status === "handled" && "Hanterad"}
                          {r.status === "converted_to_booking" && "Konverterad"}
                        </div>
                      </div>
                    </div>

                    <div className={styles.brRow}>
                      <FiTag aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>
                          Tjänster{r._serviceItems?.length ? ` (${r._serviceItems.length})` : ""}
                        </div>
                        <div className={styles.brV}>
                          {r._serviceItems && r._serviceItems.length ? (
                            <div className={styles.brChips}>
                              {r._serviceItems.map((si) => (
                                <span
                                  key={si.id}
                                  className={styles.brChip}
                                  title={si.description || si.name}
                                >
                                  {si.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.brRow}>
                      <FiCalendar aria-hidden />
                      <div className={styles.brKv}>
                        <div className={styles.brK}>Önskad dag</div>
                        <div className={styles.brV}>{desiredDate}</div>
                      </div>
                    </div>
                  </div>

                  <div className={cx(styles.brCol, styles.brMessage)}>
                    <div className={styles.brK}>Meddelande</div>
                    <div className={styles.brMsgText}>{cleanMsg || "—"}</div>
                  </div>
                </div>

                {/* Actions (alltid synliga för tydlighet) */}
                <footer className={styles.brItemFooter}>
                  <div className={styles.brActionsRow}>
                    {r.status !== "handled" && (
                      <button
                        className={cx(styles.brBtn, styles.brBtnSecondary)}
                        onClick={() => setStatus(r.id, "handled")}
                        title="Markera som hanterad"
                      >
                        <FiCheckCircle aria-hidden /> Markera som hanterad
                      </button>
                    )}

                    {r.status !== "converted_to_booking" && (
                      <button
                        className={cx(styles.brBtn, styles.brBtnSecondary, "brBtnMarkConverted")}
                        onClick={() => setStatus(r.id, "converted_to_booking")}
                        title="Markera som konverterad"
                      >
                        <FiCheckCircle aria-hidden /> Markera som konverterad
                      </button>
                    )}

                    <button
                      className={cx(styles.brBtn, styles.brBtnPrimary)}
                      onClick={goToBookingCalendar}
                      title="Skapa bokning av denna förfrågan"
                    >
                      Skapa bokning <FiExternalLink aria-hidden />
                    </button>
                  </div>
                </footer>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
