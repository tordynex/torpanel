import { useState } from "react"
import styles from "./ServiceLogForm.module.css"
import serviceLogService from "@/services/servicelogService"
import type { ServiceLogCreate, ServiceLog } from "@/services/servicelogService"
import { useWorkshop } from "@/hooks/useWorkshops"
import carService from "@/services/carService"

interface Props {
  carId: number
  onSuccess: (log: ServiceLog) => void
}

export default function ServiceLogForm({ carId, onSuccess }: Props) {
  const workshop = useWorkshop()
  const [formData, setFormData] = useState<ServiceLogCreate>({
    work_performed: "",
    mileage: 0,
    date: new Date().toISOString().slice(0, 10),
    car_id: carId,
    tasks: [],
  })

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedWorks, setSelectedWorks] = useState<string[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})

  const presetWorks = [
    "Service",
    "Bromsbyte",
    "Däckbyte / Hjulskifte",
    "Felsökning / Diagnos",
    "Kamremsbyte / Kamkedjebyte",
    "Avgasrelaterat",
    "Kopplingsbyte",
    "Stötdämpare / Fjärdring",
    "AC-service",
    "Övrig reparation",
  ]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "mileage" ? parseInt(value) : value,
    }))
  }

  const handleCheckboxChange = (work: string) => {
    setSelectedWorks((prev) =>
      prev.includes(work) ? prev.filter((w) => w !== work) : [...prev, work]
    )
  }

  const handleCommentChange = (work: string, value: string) => {
    setComments((prev) => ({ ...prev, [work]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const carData = await carService.fetchCarById(carId)

      const latestMileage = carData.service_logs.reduce((max, log) => {
        return log.mileage > max ? log.mileage : max
      }, 0)

      if (formData.mileage < latestMileage) {
        setError(`Miltalet måste vara högre än senast registrerad service. Miltal vid senast servicelog: ${latestMileage} km (${latestMileage / 10} mil)`)
        setLoading(false)
        return
      }

      const tasks = selectedWorks.map((title) => ({
        title,
        comment: comments[title] || "",
      }))

      const summary = selectedWorks.join(", ")

      const dataToSend: ServiceLogCreate = {
        ...formData,
        workshop_id: workshop.id,
        work_performed: summary,
        tasks,
      }

      const result = await serviceLogService.createLog(dataToSend)
      onSuccess(result)
    } catch (err) {
      console.error(err)
      setError("Kunde inte spara service-logg.")
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split("T")[0]

  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const minDate = oneMonthAgo.toISOString().split("T")[0]


  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h2 className={styles.title}>Lägg till service-logg</h2>

      <label>
        Datum
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          required
          min={minDate}
          max={today}
        />
      </label>

      <label>
        Mätarställning (KM)
        <input
          type="number"
          name="mileage"
          value={formData.mileage}
          onChange={handleChange}
          required
        />
        <p> ({formData.mileage / 10} Mil) </p>
      </label>

      <fieldset className={styles.checkboxGroup}>
        <legend>Arbeten utförda</legend>
        {presetWorks.map((work) => (
          <div key={work} className={styles.checkboxItem}>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={selectedWorks.includes(work)}
                onChange={() => handleCheckboxChange(work)}
              />
              <label>{work}</label>
            </div>

            {selectedWorks.includes(work) && (
              <textarea
                placeholder={`Kommentar till "${work}" (valfritt)`}
                value={comments[work] || ""}
                onChange={(e) => handleCommentChange(work, e.target.value)}
                rows={2}
                className={styles.commentBox}
              />
            )}
          </div>
        ))}
      </fieldset>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Sparar..." : "Spara service-logg"}
      </button>
    </form>
  )
}
