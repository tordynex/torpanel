import { useEffect, useMemo, useState } from "react";
import carService from "@/services/carService";
import type { CarCreate, Car } from "@/services/carService";
import styles from "./css/CreateCarForm.module.css";
import allMakes from "@/utils/cars";

interface Props {
  onCreated: (car: Car) => void;
  onCancel: () => void;
  /** Förifyll registreringsnummer – t.ex. från användarens söksträng */
  initialRegistration?: string;
}

export default function CreateCarForm({
  onCreated,
  onCancel,
  initialRegistration = "",
}: Props) {
  const currentYear = new Date().getFullYear();
  const minYear = 1897;
  const maxYear = currentYear + 1;

  // Lokal normalisering – versaler + ta bort whitespace
  const normalizeReg = (s: string) => s.toUpperCase().replace(/\s+/g, "");

  const [formData, setFormData] = useState<CarCreate>({
    registration_number: normalizeReg(initialRegistration),
    brand: "",
    model_year: currentYear,
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Uppdatera om initialRegistration ändras
  useEffect(() => {
    if (initialRegistration) {
      setFormData((prev) => ({
        ...prev,
        registration_number: normalizeReg(initialRegistration),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRegistration]);

  const canSubmit = useMemo(() => {
    return (
      !!formData.registration_number &&
      !!formData.brand &&
      !!formData.model_year &&
      formData.model_year >= minYear &&
      formData.model_year <= maxYear
    );
  }, [formData, minYear, maxYear]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "registration_number") {
      // Samma beteende som tidigare onChange: visa versaler direkt
      setFormData((prev) => ({
        ...prev,
        registration_number: value.toUpperCase(),
      }));
      return;
    }

    if (name === "model_year") {
      const num = parseInt(value || "0", 10);
      setFormData((prev) => ({
        ...prev,
        model_year: Number.isNaN(num) ? ("" as any) : num,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    // Samma som tidigare onBlur: normalisera (versaler + ta bort mellanslag)
    setFormData((prev) => ({
      ...prev,
      registration_number: normalizeReg(e.target.value),
    }));
  };

  // Extra skydd vid inklistring (förändrar inte befintlig funktionalitet – bara samma resultat vid paste)
  const handleRegPaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const norm = normalizeReg(pasted);
    setFormData((prev) => ({ ...prev, registration_number: norm }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const yr = Number(formData.model_year);
    if (!formData.registration_number) {
      setError("Ange registreringsnummer.");
      return;
    }
    if (!formData.brand) {
      setError("Välj bilmärke.");
      return;
    }
    if (!yr || yr < minYear || yr > maxYear) {
      setError(`Ange ett giltigt modellår (${minYear}–${maxYear}).`);
      return;
    }

    setLoading(true);
    try {
      const payload: CarCreate = {
        ...formData,
        // Säkerställ att det som skickas vidare alltid är i stora bokstäver utan mellanslag
        registration_number: normalizeReg(formData.registration_number),
        model_year: yr,
      };
      const car = await carService.createCar(payload);
      onCreated(car);
    } catch (err) {
      console.error(err);
      setError("Kunde inte skapa bil. Kontrollera uppgifterna och försök igen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="registration_number" className={styles.label}>
          Registreringsnummer
        </label>
        <input
          id="registration_number"
          name="registration_number"
          type="text"
          required
          className={styles.input}
          value={formData.registration_number}
          onChange={handleChange}
          onBlur={handleRegBlur}
          onPaste={handleRegPaste}
          placeholder="ABC123"
          autoComplete="off"
          inputMode="latin"
          aria-describedby="reg-help"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="brand" className={styles.label}>
          Märke
        </label>
        <select
          id="brand"
          name="brand"
          required
          className={styles.select ?? styles.input}
          value={formData.brand}
          onChange={handleChange}
          aria-describedby="brand-help"
        >
          <option value="" disabled>
            Välj bilmärke
          </option>
          {allMakes.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="model_year" className={styles.label}>
          Modellår
        </label>
        <input
          id="model_year"
          name="model_year"
          type="number"
          required
          className={styles.input}
          value={formData.model_year}
          min={minYear}
          max={maxYear}
          step={1}
          onChange={handleChange}
          aria-describedby="year-help"
          placeholder={`${currentYear}`}
          inputMode="numeric"
        />
      </div>

      {error && (
        <div className={styles.error} role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={onCancel}
          disabled={loading}
        >
          Avbryt
        </button>
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={loading || !canSubmit}
          aria-busy={loading}
        >
          {loading ? "Skapar…" : "Skapa bil"}
        </button>
      </div>
    </form>
  );
}
