import { useState } from "react"
import carService from "@/services/carService"
import workshopService from "@/services/workshopService"
import type { Car } from "@/services/carService"
import styles from "./Cars.module.css"
import { MdVerifiedUser } from "react-icons/md"

export default function Cars() {
  const [regNumber, setRegNumber] = useState("")
  const [car, setCar] = useState<Car | null>(null)
  const [editBrand, setEditBrand] = useState("")
  const [editModelYear, setEditModelYear] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [workshops, setWorkshops] = useState<Record<number, string>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    setError("")
    setCar(null)
    setWorkshops({})

    try {
      const result = await carService.fetchCarByReg(regNumber.trim().toUpperCase())
      setCar(result)
      setEditBrand(result.brand)
      setEditModelYear(result.model_year.toString())

      const newWorkshops: Record<number, string> = {}

      for (const log of result.service_logs) {
        if (log.workshop_id && !newWorkshops[log.workshop_id]) {
          try {
            const ws = await workshopService.fetchWorkshopById(log.workshop_id)
            newWorkshops[log.workshop_id] = ws.city
          } catch {
            console.warn(`Kunde inte hämta verkstad ${log.workshop_id}`)
          }
        }
      }

      setWorkshops(newWorkshops)
    } catch {
      setError("Ingen bil hittades med det registreringsnumret.")
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!car) return
    try {
      const updated = await carService.updateCar(car.id, {
        registration_number: car.registration_number,
        brand: editBrand,
        model_year: parseInt(editModelYear),
        customer_id: car.customer_id!,
      })
      setCar(updated)
      setIsEditing(false)
    } catch (err) {
      console.error("Misslyckades med att uppdatera bilen:", err)
    }
  }

  const handleDelete = async () => {
    if (!car) return
    try {
      await carService.deleteCar(car.id)
      setCar(null)
      setShowDeleteConfirm(false)
      setRegNumber("")
    } catch (err) {
      console.error("Misslyckades med att ta bort bilen:", err)
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

          {isEditing ? (
            <>
              <label>
                Märke:
                <input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} />
              </label>
              <label>
                Modellår:
                <input
                  type="number"
                  value={editModelYear}
                  onChange={(e) => setEditModelYear(e.target.value)}
                />
              </label>
              <div className={styles.buttonRow}>
                <button onClick={handleUpdate}>Spara ändringar</button>
                <button onClick={() => setIsEditing(false)}>Avbryt</button>
              </div>
            </>
          ) : (
            <>
              <p><strong>Registreringsnummer:</strong> {car.registration_number}</p>
              <p><strong>Märke:</strong> {car.brand}</p>
              <p><strong>Modellår:</strong> {car.model_year}</p>
              <div className={styles.buttonRow}>
                <button onClick={() => setIsEditing(true)}>Redigera bil</button>
                <button onClick={() => setShowDeleteConfirm(true)}>Ta bort bil</button>
              </div>
            </>
          )}

          {showDeleteConfirm && (
            <div className={styles.confirmBox}>
              <p>Är du säker på att du vill ta bort bilen?</p>
              <button className={styles.deleteBtn} onClick={handleDelete}>Ja, ta bort</button>
              <button onClick={() => setShowDeleteConfirm(false)}>Avbryt</button>
            </div>
          )}
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
                    <MdVerifiedUser /> Tryggt utfört av Autonexo ({workshops[log.workshop_id]})
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
