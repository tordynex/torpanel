import { useEffect, useState } from "react";
import { MdAddCircleOutline } from "react-icons/md";
import { GoArrowDownLeft } from "react-icons/go";
import type { Car } from "@/services/carService";
import carService, { fetchCarByReg } from "@/services/carService";
import CreateCarForm from "./CreateCarForm";
import Modal from "@/components/common/Modal";
import styles from "./css/SelectOrCreateCar.module.css";

interface Props {
  onCarSelected: (car: Car) => void;
}

export default function SelectOrCreateCar({ onCarSelected }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Car[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [prefillReg, setPrefillReg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Preview + modal
  const [previewCar, setPreviewCar] = useState<Car | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [errorPreview, setErrorPreview] = useState<string | null>(null);

  const normalizeReg = (s: string) => s.toUpperCase().replace(/\s+/g, "");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = query.trim();
      if (q.length < 2) {
        setMatches([]);
        return;
      }
      setLoading(true);
      try {
        const all = await carService.fetchAllCars();
        if (cancelled) return;
        const qLower = q.toLowerCase();
        const filtered = all.filter((car) =>
          car.registration_number.toLowerCase().includes(qLower)
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

  const openPreviewForCar = (car: Car) => {
    setErrorPreview(null);
    setPreviewCar(car);
  };

  const openPreviewByReg = async (reg: string) => {
    setErrorPreview(null);
    setLoadingPreview(true);
    try {
      const car = await fetchCarByReg(reg.replace(/\s+/g, ""));
      openPreviewForCar(car);
    } catch (e) {
      console.error(e);
      setErrorPreview("Kunde inte hämta bil med det regnumret.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const trimmed = query.trim();
  const canShowAddButton =
    trimmed.length >= 2 && !loading && matches.length === 0;


  const onConfirmPreview = () => {
    if (previewCar) {
      onCarSelected(previewCar);
      setPreviewCar(null);
    }
  };

  if (showCreateForm) {
    return (
      <div className={styles.wrapper}>
        <CreateCarForm
          initialRegistration={prefillReg}
          onCreated={(car) => {
            onCarSelected(car);
            setShowCreateForm(false);
            setPrefillReg("");
          }}
          onCancel={() => {
            setShowCreateForm(false);
            setPrefillReg("");
          }}
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim().length >= 2) {
            openPreviewByReg(query.trim());
          }
        }}
        placeholder="t.ex. ABC123"
        aria-label="Sök regnummer"
      />

      {query.trim().length < 2 && (
        <div className={styles.info}>Skriv minst två tecken för att börja söka.</div>
      )}

      {matches.length > 0 && (
        <div className={styles.resultBox} role="list">
          {loading ? (
            <div className={styles.info}>Laddar…</div>
          ) : (
            matches.map((car) => (
              <div
                key={car.id}
                role="listitem"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                }}
              >
                <div>
                  <strong>{car.registration_number}</strong>
                  {car.brand ? ` – ${car.brand}` : ""}{" "}
                  {car.model_year ? `(${car.model_year})` : ""}
                </div>
                <button
                  className={styles.selectBtn}
                  onClick={() => openPreviewForCar(car)}
                >
                  Välj <GoArrowDownLeft />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {canShowAddButton && (
        <button
          className={styles.addBtn}
          onClick={() => {
            setPrefillReg(normalizeReg(trimmed)); // förifyll med söksträngen
            setShowCreateForm(true);
          }}
          disabled={loadingPreview}
        >
          <MdAddCircleOutline size={18} style={{ verticalAlign: "text-bottom" }} />
          &nbsp;Lägg till bil
        </button>
      )}

      {/* Modal: förhandsgranskning av bil innan bekräftelse */}
      <Modal
        open={!!previewCar}
        onClose={() => setPreviewCar(null)}
        title="Bekräfta vald bil"
        footer={
          <>
            <button className={styles.selectBtn} onClick={onConfirmPreview}>
              Bekräfta
            </button>
            <button className={styles.addBtn} onClick={() => setPreviewCar(null)}>
              Avbryt
            </button>
          </>
        }
      >
        {!previewCar ? (
          <div>Laddar…</div>
        ) : (
          <div className={styles.selectedCar}>
            <div className={styles.selectedCarTitle}>Bilinformation</div>
            <div className={styles.selectedCarBody}>
              <div>
                <strong>Reg.nr:</strong> {previewCar.registration_number}
              </div>
              {previewCar.brand && (
                <div>
                  <strong>Märke:</strong> {previewCar.brand}
                </div>
              )}
              {previewCar.model_year && (
                <div>
                  <strong>Årsmodell:</strong> {previewCar.model_year}
                </div>
              )}
              {previewCar.model && (
                <div>
                  <strong>Modell:</strong> {previewCar.model}
                </div>
              )}
              {previewCar.vin && (
                <div>
                  <strong>VIN:</strong> {previewCar.vin}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
