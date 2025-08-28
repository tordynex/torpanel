import { useState } from "react"
import carService from "@/services/carService"
import workshopService from "@/services/workshopService"
import type { Car } from "@/services/carService"
import styles from "./css/CarDatabase.module.css"
import { MdVerifiedUser } from "react-icons/md";

export default function CarDatabase() {
  const [regNumber, setRegNumber] = useState("")
  const [car, setCar] = useState<Car | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [workshops, setWorkshops] = useState<Record<number, string>>({})

  const handleSearch = async () => {
    setLoading(true)
    setError("")
    setCar(null)
    setWorkshops({})

    try {
      const result = await carService.fetchCarByReg(regNumber.trim().toUpperCase())
      setCar(result)

      const newWorkshops: Record<number, string> = {}

      for (const log of result.service_logs) {
        if (log.workshop_id && !newWorkshops[log.workshop_id]) {
          try {
            const ws = await workshopService.fetchWorkshopById(log.workshop_id)
            newWorkshops[log.workshop_id] = ws.city
          } catch (e) {
            console.warn(`Kunde inte hämta verkstad ${log.workshop_id}`)
          }
        }
      }

      setWorkshops(newWorkshops)
    } catch (err: any) {
      console.error(err)
      setError("Ingen bil hittades med det registreringsnumret.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Sök efter bil</h2>

      <div className={styles.searchBox}>
        <input
          type="text"
          placeholder="Ex: ABC123"
          value={regNumber}
          onChange={(e) => setRegNumber(e.target.value)}
        />
        <button onClick={handleSearch} disabled={loading || !regNumber.trim()}>
          {loading ? "Söker..." : "Sök"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {car && (
        <div className={styles.result}>
          <h3>Bilinformation</h3>
          <p><strong>Registreringsnummer:</strong> {car.registration_number}</p>
          <p><strong>Märke:</strong> {car.brand}</p>
          <p><strong>Modellår:</strong> {car.model_year}</p>
        </div>
      )}
      {car && car.service_logs.length > 0 && (
          <div className={styles.serviceLogs}>
            <h3>Servicehistorik</h3>
            {car.service_logs.map((log) => (
              <div key={log.id} className={styles.serviceCard}>
                <p><strong>Datum:</strong> {log.date}</p>
                <p><strong>Mätarställning:</strong> {log.mileage.toLocaleString()} km</p>
                <p><strong>Summering:</strong><br />{log.work_performed}</p>
                {log.tasks.length > 0 && (
                  <ul className={styles.taskList}>
                    {log.tasks.map((task) => (
                      <li key={task.id}>
                        <strong>{task.title}:</strong> {task.comment}
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.verifiedBox}>
                  {log.workshop_id && workshops[log.workshop_id] && (
                      <p className={styles.verifiedBy}>
                        <MdVerifiedUser /> Tryggt och säkert utfört av Autonexo ({workshops[log.workshop_id]})
                      </p>
                  )}
                </div>
              </div>
            ))}
          </div>
      )}
    </div>
  )
}
