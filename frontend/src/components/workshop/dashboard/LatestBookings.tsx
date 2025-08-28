import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkshop } from "@/hooks/useWorkshops";
import { listBookings, BookingStatus } from "@/services/baybookingService";
import type { BayBookingRead } from "@/services/baybookingService";
import styles from "./css/LatestBookings.module.css";

/** Format (sv-SE, 24h) */
const fmtDate = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const fmtTime = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_TEXT: Record<BookingStatus, string> = {
  booked: "Bokad",
  in_progress: "Pågår",
  completed: "Klar",
  cancelled: "Avbokad",
  no_show: "Uteblev",
};

export type LatestBookingsProps = {
  /** Antal rader (default 6) */
  limit?: number;
  /** Hur långt bak vi letar i kalendern (default 90 dagar) */
  lookbackDays?: number;
  /** Hur långt fram vi letar i kalendern (default 90 dagar) */
  lookaheadDays?: number;
};

export default function LatestBookings({
  limit = 6,
  lookbackDays = 90,
  lookaheadDays = 90,
}: LatestBookingsProps) {
  const workshop = useWorkshop();
  const navigate = useNavigate();

  const [data, setData] = useState<BayBookingRead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!workshop?.id) return;
      setLoading(true);
      setError(null);

      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - lookbackDays);
      const to = new Date(now);
      to.setDate(to.getDate() + lookaheadDays);

      try {
        const bookings = await listBookings({
          workshopId: workshop.id,
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
          includeCancelled: true, // vi vill visa "senast skapade" oavsett status
        });

        // === Viktigt: sortera på ID fallande som proxy för "senast skapad" ===
        const byNewestCreated = bookings
          .slice()
          .sort((a, b) => b.id - a.id)
          .slice(0, limit);

        if (alive) setData(byNewestCreated);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Kunde inte hämta bokningar.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [workshop?.id, limit, lookbackDays, lookaheadDays]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className={styles.skeletonStack}>
          {Array.from({ length: limit }).map((_, i) => (
            <div className={styles.rowSkeleton} key={i}>
              <div className={styles.skAvatar} />
              <div className={styles.skCol}>
                <div className={styles.skLine} />
                <div className={styles.skLineThin} />
              </div>
              <div className={styles.skChip} />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.errorBox}>
          {error}
          <button className={styles.btnSecondary} onClick={() => window.location.reload()}>
            Försök igen
          </button>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>🗂️</div>
          <div className={styles.emptyTitle}>Inga bokningar ännu</div>
          <div className={styles.emptyText}>
            När nya bokningar skapas dyker de upp här.
          </div>
          <button className={styles.btn} onClick={() => navigate("/workshop/calendar")}>
            Visa kalender
          </button>
        </div>
      );
    }

    return (
      <ul className={styles.list} role="list">
        {data.map((b) => {
          const start = new Date(b.start_at);
          const end = new Date(b.end_at);
          const dateLabel = `${fmtDate.format(start)} • ${fmtTime.format(start)}–${fmtTime.format(
            end
          )}`;

          return (
            <li key={b.id} className={styles.item}>
              <div className={styles.avatar} aria-hidden>
                <span className={styles.avatarDay}>
                  {String(start.getDate()).padStart(2, "0")}
                </span>
                <span className={styles.avatarMon}>
                  {fmtDate.format(start).split(" ").pop()}
                </span>
              </div>

              <div className={styles.meta}>
                <div className={styles.titleRow}>
                  <span className={styles.title} title={b.title}>{b.title}</span>
                  {b.service_item?.name && (
                    <span className={styles.subtle}>• {b.service_item.name}</span>
                  )}
                </div>
                <div className={styles.subRow}>
                  <span className={styles.when}>{dateLabel}</span>
                  <span className={styles.dot} />
                  <span className={styles.where}>Plats #{b.bay_id}</span>
                  {b.source && (
                    <>
                      <span className={styles.dot} />
                      <span className={styles.source}>Källa: {b.source}</span>
                    </>
                  )}
                </div>
              </div>

              <span className={`${styles.chip} ${styles[`chip--${b.status}`]}`}>
                {STATUS_TEXT[b.status]}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }, [loading, error, data, limit, navigate]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <div className={styles.cardTitle}>Senast skapade bokningar</div>
          <div className={styles.subtitle}>
            Visar de {limit} senast skapade bokningarna (oavsett status).
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.btnSecondary}
            onClick={() => navigate("/workshop/calendar")}
            disabled={!workshop}
          >
            Visa kalender
          </button>
        </div>
      </div>

      {content}
    </div>
  );
}
