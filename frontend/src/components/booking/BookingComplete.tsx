import React, { useMemo } from "react";
import {href, useLocation, useNavigate} from "react-router-dom";
import styles from "./css/BookingComplete.module.css";
import { FiCheckCircle, FiArrowLeft, FiHome, FiExternalLink } from "react-icons/fi";

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

export default function BookingComplete() {
  const query = useQuery();
  const navigate = useNavigate();

  const bookingId = query.get("bookingId") || undefined;

  return (
    <div className={styles.shell}>
      {/* Lätt konfetti-bakgrund */}
      <div className={styles.confetti} aria-hidden>
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>

      <div className={styles.card}>
        {/* Check-ikon med stroke-animering */}
        <div className={styles.iconWrap} aria-hidden="true">
          <svg className={styles.checkSvg} viewBox="0 0 64 64" role="img">
            <circle className={styles.ring} cx="32" cy="32" r="28" />
            <path className={styles.tick} d="M18 33.5 L28 43 L46 25" />
          </svg>
        </div>

        <h1 className={styles.title}>
          Bokning genomförd!
        </h1>

        <p className={styles.subtitle}>
          Tack – din bokning är registrerad och verkstaden får all information.
          {bookingId ? (
            <> Ditt bokningsnummer är <strong>#{bookingId}</strong>.</>
          ) : null}
        </p>

        {/* Snabb info-ruta */}
        <div className={styles.info}>
          <FiCheckCircle aria-hidden className={styles.infoIcon} />
          <div>
            <div className={styles.infoTitle}>Vad händer nu?</div>
            <div className={styles.infoText}>
              Du får en bekräftelse via e‑post/SMS. Behöver verkstaden kompletterande uppgifter kontaktar de dig.
            </div>
          </div>
        </div>

        {/* Åtgärder */}
        <div className={styles.actions}>

          <div className={styles.actionsRight}>
              <a
                href="https://www.autonexo.se/"
                className={`${styles.btn} ${styles.btnPrimary}`}
                rel="noopener noreferrer"
              >
                Till startsidan <FiHome aria-hidden />
              </a>
            </div>
        </div>

        {/* Liten fotnot */}
        <p className={styles.footnote}>
          Behöver du ändra något? Hör av dig direkt till verkstaden eller hantera bokningen under <em>Mina bokningar</em>.
        </p>
      </div>
    </div>
  );
}
