import { useEffect, useState } from "react";
import { MdAddCircleOutline } from "react-icons/md";
import { GoArrowDownLeft } from "react-icons/go";
import type { Car } from "@/services/carService";
import carService from "@/services/carService";
import CreateCarForm from "./CreateCarForm";
import styles from "./SelectOrCreateCar.module.css";

interface Props {
  onCarSelected: (car: Car) => void;
}

export default function SelectOrCreateCar({ onCarSelected }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Car[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const customerId = 1; // TODO: hämta från inloggad användare/verkstad

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (query.trim().length < 2) {
        setMatches([]);
        return;
      }
      setLoading(true);
      try {
        const all = await carService.fetchAllCars();
        if (cancelled) return;
        const q = query.toLowerCase();
        const filtered = all.filter((car) =>
          car.registration_number.toLowerCase().includes(q)
        );
        setMatches(filtered);
      } catch (err) {
        console.error("Kunde inte hämta bilar", err);
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (showCreateForm) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.title}>Lägg till ny bil</div>
        <CreateCarForm
          customerId={customerId}
          onCreated={(car) => {
            onCarSelected(car);
            setShowCreateForm(false);
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>Sök bil (registreringsnummer)</div>

      <input
        className={styles.input}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value.toUpperCase())}
        placeholder="t.ex. ABC123"
        aria-label="Sök regnummer"
      />

      {/* Info / varningstexter */}
      {query.trim().length < 2 && (
        <div className={styles.info}>
          Skriv minst två tecken för att börja söka.
        </div>
      )}

      {query.trim().length >= 2 && !loading && matches.length === 0 && (
        <>
          <div className={styles.warning}>
            Ingen bil hittades med det regnumret.
          </div>
          <button
            className={styles.addBtn}
            onClick={() => setShowCreateForm(true)}
          >
            <MdAddCircleOutline size={18} style={{ verticalAlign: "text-bottom" }} />
            &nbsp;Lägg till bil
          </button>
        </>
      )}

      {/* Resultatlista */}
      {matches.length > 0 && (
        <div className={styles.resultBox} role="list">
          {loading ? (
            <div className={styles.info}>Laddar…</div>
          ) : (
            matches.map((car) => (
              <div key={car.id} role="listitem" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <div>
                  <strong>{car.registration_number}</strong>
                  {car.brand ? ` – ${car.brand}` : ""}{" "}
                  {car.model_year ? `(${car.model_year})` : ""}
                </div>
                <button
                  className={styles.selectBtn}
                  onClick={() => onCarSelected(car)}
                >
                  Välj <GoArrowDownLeft />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Snabbgenväg: skapa bil direkt */}
      {query.trim().length >= 2 && (
        <button
          className={styles.addBtn}
          onClick={() => setShowCreateForm(true)}
        >
          <MdAddCircleOutline size={18} style={{ verticalAlign: "text-bottom" }} />
          &nbsp;Lägg till bil
        </button>
      )}
    </div>
  );
}
