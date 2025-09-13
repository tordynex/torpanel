import React, { useEffect, useMemo } from "react";
import {
  FiMapPin,
  FiTool,
  FiClipboard,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import { TfiCar } from "react-icons/tfi";
import styles from "./css/BookingLayout.module.css";

export type BookingStep = 1 | 2 | 3 | 4;

type StepDef = {
  id: BookingStep;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

const STEP_DEFS: StepDef[] = [
  { id: 1, title: "Registreringsnummer", subtitle: "Fyll i ditt regnr", icon: <TfiCar /> },
  { id: 2, title: "Välj verkstad", subtitle: "Hitta närmast dig", icon: <FiMapPin /> },
  { id: 3, title: "Välj tjänst", subtitle: "Vad vill du göra?", icon: <FiTool /> },
  { id: 4, title: "Översikt & boka", subtitle: "Kontrollera och bekräfta", icon: <FiClipboard /> },
];

export interface BookingLayoutProps {
  step: BookingStep;
  onStepChange: (next: BookingStep) => void;
  /** Disablas “Nästa” om formulärsteg inte är klart */
  canProceed?: boolean;
  /** Visa/ändra rubrik under logotypen. Lämnas tom för default från STEP_DEFS. */
  headingOverride?: string;
  /** Valfri extra actions till höger i header (t.ex. support-länk) */
  headerActions?: React.ReactNode;
  /** Innehåll för det aktuella steget */
  children?: React.ReactNode;
  /** Valfri callback för Föregående/Nästa, annars används onStepChange */
  onNext?: () => void;
  onPrev?: () => void;
}

/**
 * Baslayout för bokningsflödet (4 steg, egen sida per steg).
 * - Toppstegvisare som även är klickbar för snabbnavigering.
 * - Progressbar.
 * - Klistrad actionbar längst ner med Föregående/Nästa.
 * - Tangentbord: ← och → byter steg (om tillåtet).
 */
export default function BookingLayout({
  step,
  onStepChange,
  canProceed = true,
  headingOverride,
  headerActions,
  children,
  onNext,
  onPrev,
}: BookingLayoutProps) {
  const steps = STEP_DEFS;
  const currentIdx = useMemo(() => Math.max(0, steps.findIndex((s) => s.id === step)), [step]);
  const progress = useMemo(() => (currentIdx / (steps.length - 1)) * 100, [currentIdx, steps.length]);

  // Keyboard navigation (Left/Right)
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (step > 1) (onPrev || (() => onStepChange((step - 1) as BookingStep)))();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (step < 4 && canProceed) (onNext || (() => onStepChange((step + 1) as BookingStep)))();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [step, canProceed, onStepChange, onNext, onPrev]);

  const goTo = (target: BookingStep) => {
    // Tillåt alltid att klicka bakåt, framåt endast upp till aktuellt+1
    if (target < step) return onStepChange(target);
    if (target === (step + 1) as BookingStep && canProceed) return onStepChange(target);
  };

  const Heading = headingOverride ?? steps[currentIdx]?.title ?? "Bokning";
  const Sub = steps[currentIdx]?.subtitle ?? "";

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.headerBar}>
        <div className={styles.brand}>
          <div className={styles.brandText}>
            <div className={styles.logo}><img src="/autonexum_normal.png" alt="Autonexum Logga Vit PNG"/></div>

            <div className={styles.brandSub}>Boka verkstadstid</div>
          </div>
        </div>
        <div className={styles.headerSpacer} />
        {headerActions}
      </header>

      {/* Stepper */}
      <div className={styles.stepperWrap}>
        <nav className={styles.stepper} aria-label="Bokningssteg">
          {steps.map((s, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const clickable = isDone || i === currentIdx + 1; // bakåt eller nästa
            return (
              <button
                key={s.id}
                className={[
                  styles.step,
                  isActive ? styles.stepActive : "",
                  isDone ? styles.stepDone : "",
                ].join(" ")}
                onClick={() => clickable && goTo(s.id)}
                aria-current={isActive ? "step" : undefined}
                aria-disabled={!clickable}
              >
                <span className={styles.stepIcon} aria-hidden>
                  {isDone ? <FiCheck /> : s.icon}
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepTitle}>{s.title}</span>
                  <span className={styles.stepSub}>{s.subtitle}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Content card */}
      <main className={styles.card}>
        <div className={styles.formHeader}>
          <h1 className={styles.formTitle}>{Heading}</h1>
          {Sub && <p className={styles.formSubtitle}>{Sub}</p>}
        </div>
        <div className={styles.content}>{children}</div>
      </main>

      {/* Sticky action bar */}
      <div className={styles.actionSticky}>
        <div className={styles.actionInner}>
          <div className={styles.actionLeft}>
            {step > 1 && (
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={onPrev || (() => onStepChange((step - 1) as BookingStep))}
              >
                <FiChevronLeft aria-hidden /> Föregående
              </button>
            )}
          </div>
          <div className={styles.actionRight}>
            {step < 4 ? (
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onNext || (() => onStepChange((step + 1) as BookingStep))}
                disabled={!canProceed}
              >
                Nästa <FiChevronRight aria-hidden />
              </button>
            ) : (
                <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onNext || (() => onStepChange(step))}
                disabled={!canProceed}
              >
                Boka nu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}