import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkshop } from "@/hooks/useWorkshops";
import SelectOrCreateCar from "@/components/workshop/SelectOrCreateCar";
import ServiceLogForm from "@/components/workshop/ServiceLogForm";
import type { Car } from "@/services/carService";
import type { ServiceLog } from "@/services/servicelogService";
import styles from "./ServiceLogPage.module.css";

export default function ServiceLogPage() {
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [latestLog, setLatestLog] = useState<ServiceLog | null>(null);

  const auth = useAuth();
  const userName = useMemo(() => auth?.username ?? "användare", [auth]);

  const workshop = useWorkshop();

  const handleCarSelected = (car: Car) => {
    setSelectedCar(car);
    setLatestLog(null);
  };

  const handleLogSaved = (log: ServiceLog) => {
    setLatestLog(log);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Serviceloggar</h2>
          <p className={styles.subtitle}>Inloggad: <strong>{userName}</strong></p>
        </div>

        <div className={styles.badge}>
          <span className={styles.dot} />
          {workshop ? (
            <>
              {workshop.name} • {workshop.city}
            </>
          ) : (
            <>Laddar verkstad…</>
          )}
        </div>
      </header>

      <section className={styles.grid}>
        {/* Vänster kolumn: välj/skapabil */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Välj eller lägg till bil</div>
          <SelectOrCreateCar onCarSelected={handleCarSelected} />

          {selectedCar && (
            <div className={styles.selectedCar}>
              <div className={styles.selectedCarTitle}>Vald bil</div>
              <div className={styles.selectedCarBody}>
                <div><strong>Reg.nr:</strong> {selectedCar.registration_number}</div>
                {selectedCar.brand && <div><strong>Märke:</strong> {selectedCar.brand}</div>}
                {selectedCar.model_year && <div><strong>Årsmodell:</strong> {selectedCar.model_year}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Höger kolumn: formulär */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Skapa servicelog</div>
          {!selectedCar ? (
            <div className={styles.placeholder}>
              Välj en bil till vänster för att skapa en servicelog.
            </div>
          ) : (
            <ServiceLogForm carId={selectedCar.id} onSuccess={handleLogSaved} />
          )}

          {latestLog && (
            <div className={styles.success}>
              <strong>Service-logg sparad!</strong>
              <div className={styles.successGrid}>
                <div><span>Datum:</span> {latestLog.date}</div>
                <div><span>Mätarställning:</span> {latestLog.mileage} km</div>
                <div className={styles.fullRow}><span>Utfört arbete:</span> {latestLog.work_performed}</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}