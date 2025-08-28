import { useMemo, useState } from "react";
import styles from "./css/ServiceLogForm.module.css";
import serviceLogService from "@/services/servicelogService";
import type { ServiceLogCreate, ServiceLog } from "@/services/servicelogService";
import { useWorkshop } from "@/hooks/useWorkshops";
import carService from "@/services/carService";

interface Props {
  carId: number;
  onSuccess: (log: ServiceLog) => void;
}

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
];

const formatKm = (n: number) => n.toLocaleString("sv-SE");
const formatMileageJSX = (n: number) => (
  <>
    <strong>{formatKm(n)} km</strong> ({(n / 10).toLocaleString("sv-SE")} mil)
  </>
);

export default function ServiceLogForm({ carId, onSuccess }: Props) {
  const workshop = useWorkshop();

  const [formData, setFormData] = useState<ServiceLogCreate>({
    work_performed: "",
    mileage: 0,
    date: new Date().toISOString().slice(0, 10),
    car_id: carId,
    tasks: [],
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedWorks, setSelectedWorks] = useState<string[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const minDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  }, []);

  const kmTxt = useMemo(() => formatKm(Number(formData.mileage || 0)), [formData.mileage]);
  const milTxt = useMemo(() => (Number(formData.mileage || 0) / 10).toLocaleString("sv-SE"), [formData.mileage]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "mileage" ? Number(value) : value,
    }));
  };

  const handleCheckboxChange = (work: string) => {
    setSelectedWorks((prev) =>
      prev.includes(work) ? prev.filter((w) => w !== work) : [...prev, work]
    );
  };

  const handleCommentChange = (work: string, value: string) => {
    setComments((prev) => ({ ...prev, [work]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workshop?.id) {
      setError("Ingen verkstad vald – kan inte spara.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Validera mot senaste kända mätarställning
      const carData = await carService.fetchCarById(carId);
      const latestMileage = (carData?.service_logs || []).reduce((max: number, log: any) => {
        return log.mileage > max ? log.mileage : max;
      }, 0);

      if (formData.mileage < latestMileage) {
        setError(
          `Mätarställning måste vara högre än senast registrerade (${formatKm(latestMileage)} km / ${(latestMileage / 10).toLocaleString("sv-SE")} mil).`
        );
        setLoading(false);
        return;
      }

      const tasks = selectedWorks.map((title) => ({
        title,
        comment: comments[title] || "",
      }));

      const summary = selectedWorks.join(", ");

      const dataToSend: ServiceLogCreate = {
        ...formData,
        workshop_id: workshop.id,
        work_performed: summary || formData.work_performed,
        tasks,
      };

      const result = await serviceLogService.createLog(dataToSend);
      onSuccess(result);

      // Nollställ formulär (behåll datum)
      setSelectedWorks([]);
      setComments({});
      setFormData((prev) => ({
        ...prev,
        work_performed: "",
        mileage: 0,
        tasks: [],
      }));
    } catch (err) {
      console.error(err);
      setError("Kunde inte spara service-logg.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form} autoComplete="off">
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Datum</label>
          <input
            className={styles.input}
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
            min={minDate}
            max={today}
          />
          <div className={styles.help}>Tillåtet intervall: senaste månaden → idag</div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Mätarställning</label>
          <input
            className={styles.input}
            type="number"
            name="mileage"
            inputMode="numeric"
            min={0}
            step={1}
            value={formData.mileage}
            onChange={handleChange}
            required
            placeholder="t.ex. 120000"
          />
          <div className={styles.help}>
            {formatMileageJSX(Number(formData.mileage || 0))}
          </div>
        </div>
      </div>

      {/* Valda arbeten som chips */}
      {selectedWorks.length > 0 && (
        <div className={styles.chips} aria-live="polite">
          {selectedWorks.map((w) => (
            <span key={w} className={styles.chip}>{w}</span>
          ))}
        </div>
      )}

      {/* Arbeten som kort/checkboxar */}
      <fieldset className={styles.field}>
        <legend className={styles.label}>Arbeten utförda</legend>
        <div className={styles.checkGrid}>
          {presetWorks.map((work) => {
            const checked = selectedWorks.includes(work);
            return (
              <div key={work} className={styles.checkCard}>
                <div className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleCheckboxChange(work)}
                    className={styles.checkbox}
                    id={`work-${work}`}
                  />
                  <label htmlFor={`work-${work}`}>{work}</label>
                </div>

                {checked && (
                  <textarea
                    className={`${styles.textarea} ${styles.commentBox}`}
                    placeholder={`Kommentar till "${work}" (valfritt)`}
                    value={comments[work] || ""}
                    onChange={(e) => handleCommentChange(work, e.target.value)}
                    rows={2}
                  />
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <div className={styles.error} role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="reset"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => {
            setSelectedWorks([]);
            setComments({});
            setFormData((prev) => ({ ...prev, work_performed: "", mileage: 0, tasks: [] }));
            setError("");
          }}
        >
          Rensa
        </button>

        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "Sparar…" : "Spara service‑logg"}
        </button>
      </div>
    </form>
  );
}
