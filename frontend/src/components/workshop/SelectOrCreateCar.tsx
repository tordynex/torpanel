import { useEffect, useState } from "react"
import { MdAddCircleOutline } from "react-icons/md"
import type { Car } from "@/services/carService"
import carService from "@/services/carService"
import CreateCarForm from "./CreateCarForm"
import { GoArrowDownLeft } from "react-icons/go";


interface Props {
  onCarSelected: (car: Car) => void
}

export default function SelectOrCreateCar({ onCarSelected }: Props) {
  const [query, setQuery] = useState("")
  const [matches, setMatches] = useState<Car[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)

  const customerId = 1 // Anpassa efter inloggad verkstad/användare om det behövs

  useEffect(() => {
    if (query.length < 2) {
      setMatches([])
      return
    }

    const fetch = async () => {
      try {
        const all = await carService.fetchAllCars()
        const filtered = all.filter((car) =>
          car.registration_number.toLowerCase().includes(query.toLowerCase())
        )
        setMatches(filtered)
      } catch (err) {
        console.error("Kunde inte hämta bilar", err)
      }
    }

    fetch()
  }, [query])

  return (
    <div>
      {!showCreateForm ? (
        <>
          <label>
            Sök bil (regnummer):
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="t.ex. ABC123"
              style={{ display: "block", margin: "0.5rem 0" }}
            />
          </label>

          {matches.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {matches.map((car) => (
                <li key={car.id}>
                  <button onClick={() => onCarSelected(car)}>
                    {car.registration_number} – {car.brand} ({car.model_year}) <GoArrowDownLeft />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p>Ingen bil hittades med det registreringsnumret.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  backgroundColor: "#ef5027",
                  color: "white",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                <MdAddCircleOutline size={20} />
                Lägg till bil
              </button>
            </>
          )}
        </>
      ) : (
        <CreateCarForm
          customerId={customerId}
          onCreated={(car) => {
            onCarSelected(car)
            setShowCreateForm(false)
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}
    </div>
  )
}
