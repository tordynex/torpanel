import { useState } from "react"
import carService from "@/services/carService"
import type { CarCreate, Car } from "@/services/carService"
import styles from "./CreateCarForm.module.css"

interface Props {
  onCreated: (car: Car) => void
  onCancel: () => void
  customerId: number
}

export default function CreateCarForm({ onCreated, onCancel, customerId }: Props) {
  const [formData, setFormData] = useState<CarCreate>({
    registration_number: "",
    brand: "",
    model_year: new Date().getFullYear(),
    customer_id: customerId,
  })

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "model_year" ? parseInt(value) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const car = await carService.createCar(formData)
      onCreated(car)
    } catch (err: any) {
      console.error(err)
      setError("Kunde inte skapa bil. Kontrollera uppgifterna.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h2 className={styles.title}>Lägg till ny bil</h2>

      <label>
        Registreringsnummer
        <input
          name="registration_number"
          type="text"
          required
          value={formData.registration_number}
          onChange={handleChange}
        />
      </label>

      <label>
        Märke
        <input
          name="brand"
          type="text"
          required
          value={formData.brand}
          onChange={handleChange}
        />
      </label>

      <label>
        Modellår
        <input
          name="model_year"
          type="number"
          required
          value={formData.model_year}
          onChange={handleChange}
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.buttons}>
        <button type="submit" disabled={loading}>
          {loading ? "Skapar..." : "Skapa bil"}
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  )
}
