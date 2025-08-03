import { useState } from "react"
import { useWorkshop } from "@/hooks/useWorkshops"
import SelectOrCreateCar from "@/components/workshop/SelectOrCreateCar"
import ServiceLogForm from "@/components/workshop/ServiceLogForm"
import type { Car } from "@/services/carService"
import type { ServiceLog } from "@/services/servicelogService"

export default function ServiceLogPage() {
  const [selectedCar, setSelectedCar] = useState<Car | null>(null)
  const [latestLog, setLatestLog] = useState<ServiceLog | null>(null)
  const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
  const workshop = useWorkshop()

  const handleCarSelected = (car: Car) => {
    setSelectedCar(car)
    setLatestLog(null) // reset if switching car
  }

  const handleLogSaved = (log: ServiceLog) => {
    setLatestLog(log)
  }

  return (
    <div>
      <p>Inloggad användare: <strong>{user.username}</strong></p>
      {workshop && (
        <p>
          {workshop.name} i {workshop.city}
        </p>
      )}

      <hr style={{ margin: "1.5rem 0" }} />

      <SelectOrCreateCar onCarSelected={handleCarSelected} />

      {selectedCar && (
        <>
          <h3 style={{ marginTop: "2rem" }}>
            Skapa servicelog för {selectedCar.registration_number}
          </h3>
          <ServiceLogForm carId={selectedCar.id} onSuccess={handleLogSaved} />
        </>
      )}

      {latestLog && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#e6f7ec", border: "1px solid #b7eb8f", borderRadius: "6px" }}>
          <strong>Service-logg sparad!</strong>
          <p><strong>Datum:</strong> {latestLog.date}</p>
          <p><strong>Mätarställning:</strong> {latestLog.mileage} km</p>
          <p><strong>Utfört arbete:</strong> {latestLog.work_performed}</p>
        </div>
      )}
    </div>
  )
}
