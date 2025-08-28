import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import SelectOrCreateCar from "@/components/workshop/SelectOrCreateCar";
import ServiceLogForm from "@/components/workshop/ServiceLogForm";
import type { Car } from "@/services/carService";
import type { ServiceLog } from "@/services/servicelogService";
import servicelogService from "@/services/servicelogService";
import styles from "./css/ServiceLogPage.module.css";

export default function ServiceLogPage() {
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [latestLog, setLatestLog] = useState<ServiceLog | null>(null);

  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorLogs, setErrorLogs] = useState<string | null>(null);

  function formatMileage(m) {
    return `${m.toLocaleString("sv-SE")} km (${(m / 10).toLocaleString("sv-SE")} mil)`;
  }

  const handleCarSelected = (car: Car) => {
    setSelectedCar(car);
    setLatestLog(null);
  };

  const handleLogSaved = (log: ServiceLog) => {
    setLatestLog(log);
    // Uppdatera listan direkt överst
    setLogs((prev) => [log, ...prev]);
  };

  // Hämta serviceloggar när bil bekräftas
  useEffect(() => {
  let alive = true;
  (async () => {
    if (!selectedCar?.id) { setLogs([]); return; }
    setLoadingLogs(true);
    setErrorLogs(null);
    try {
      const data = await servicelogService.fetchLogsForCar(selectedCar.id); // 👈 bytt metodnamn
      if (!alive) return;
      setLogs((data || []).sort((a, b) => (a.date < b.date ? 1 : -1)));
    } catch (e) {
      if (!alive) return;
      setErrorLogs("Kunde inte hämta serviceloggar.");
      setLogs([]);
    } finally {
      if (alive) setLoadingLogs(false);
    }
  })();
  return () => { alive = false; };
}, [selectedCar?.id]);

  return (
    <div className={styles.page}>

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

           {/* Lista med befintliga loggar */}
          <div className={styles.divider} />
          <div className={styles.cardTitle}>Historik</div>
          {!selectedCar ? (
            <div className={styles.placeholder}>Ingen bil vald.</div>
          ) : loadingLogs ? (
            <div className={styles.info}>Hämtar historik…</div>
          ) : errorLogs ? (
            <div className={styles.warning}>{errorLogs}</div>
          ) : logs.length === 0 ? (
            <div className={styles.info}>Inga serviceloggar ännu.</div>
          ) : (
            <ul className={styles.logList}>
              {logs.map((l) => (
                <li key={l.id} className={styles.logItem}>
                  {/* Översta raden: datum, mätarställning, verkstad */}
                  <div className={styles.logRow}>
                    <div><strong>{l.date}</strong></div>
                    <div className={styles.logRowRight}>
                      <div className={styles.badgeSmall}>
                        {l.workshop_name ?? "Okänd verkstad"}
                      </div>
                      <div>{formatMileage(l.mileage)}</div>
                    </div>
                  </div>

                  {/* Utfört arbete */}
                  <div className={styles.logWork}>
                    {l.work_performed || <em>Utan beskrivning</em>}
                  </div>

                  {/* Tasks-lista (om finns) */}
                  {Array.isArray(l.tasks) && l.tasks.length > 0 && (
                    <div className={styles.taskList}>
                      {l.tasks.map((t) => (
                        <div key={t.id} className={styles.taskItem}>
                          <div className={styles.taskTitle}>{t.title}</div>
                          {t.comment && <div className={styles.taskComment}>{t.comment}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}


        </div>

        {/* Höger kolumn: formulär + logglista */}
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