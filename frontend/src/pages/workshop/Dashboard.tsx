import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkshop } from "@/hooks/useWorkshops";
import styles from "./Dashboard.module.css";
import { PiHandWavingFill } from "react-icons/pi";

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
              Ny service
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => navigate("/workshop/servicelog")}
            >
              Lägg till bil
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => navigate("/workshop/car-database")}
            >
              Visa loggar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
