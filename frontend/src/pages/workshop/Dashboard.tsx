import { useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkshop } from "@/hooks/useWorkshops";
import styles from "./css/Dashboard.module.css";
import { PiHandWavingFill } from "react-icons/pi";
import Modal from "@/components/common/Modal"
import SimpleBookingForm from "@/components/booking/SimpleBookingForm";
import BookingRequests from "@/components/workshop/dashboard/BookingRequests.tsx";
import LatestBookings from "@/components/workshop/dashboard/LatestBookings.tsx";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 10) return "God morgon";
  if (h < 18) return "Goddag";
  return "God kväll";
}

export default function Dashboard() {
  const auth = useAuth(); // { username, role, ... } eller null
  const workshop = useWorkshop();

  const userName = useMemo(() => auth?.username ?? "vän", [auth]);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {getGreeting()}, {userName}! <span className={styles.wave}><PiHandWavingFill /></span>
          </h2>
          <p className={styles.subtitle}>Välkommen tillbaka till partnerpanelen.</p>
        </div>

        <div className={styles.badge}>
          {workshop ? (
            <>
              <span className={styles.dot} />
              {workshop.name} • {workshop.city}
            </>
          ) : (
            <>
              <span className={`${styles.dot} ${styles.pulse}`} />
              Laddar verkstad…
            </>
          )}
        </div>
      </header>

      <section className={styles.grid}>
        {/* Snabb-info-kort */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Dagens läge</div>
          {workshop ? (
            <ul className={styles.list}>
              <li><strong>Verkstad:</strong> {workshop.name}</li>
              <li><strong>Stad:</strong> {workshop.city}</li>
              {workshop.phone && <li><strong>Telefon:</strong> {workshop.phone}</li>}
            </ul>
          ) : (
            <div className={styles.skeletonStack}>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Snabbåtgärder</div>
          <div className={styles.actions}>
            <button
              className={styles.btnSecondary}
              onClick={() => navigate("/workshop/servicelog")}
            >
              Ny servicelog
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => navigate("/workshop/servicelog")}
            >
              Sök servicelog
            </button>
              <button
              className={styles.btnSecondary}
              onClick={() => setOpen(true)}
              disabled={!workshop}
            >
              Ny Snabb-bokning
            </button>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
          <div className={styles.card}>
            <BookingRequests />
          </div>
          <div className={styles.card}>
            < LatestBookings limit={5}/>
          </div>
      </section>


        <Modal
        open={open}
        title="Lägg till bokning"
        onClose={() => setOpen(false)}
      >
        {workshop && (
          <SimpleBookingForm
            workshopId={workshop.id}
            onSuccess={(booking) => {
              setOpen(false);
              navigate("/workshop/calendar");
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>

    </div>
  );
}
