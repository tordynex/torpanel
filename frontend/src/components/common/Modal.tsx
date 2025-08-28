import { ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  title?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ title, open, onClose, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title || "dialog"}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button className={styles.close} onClick={onClose} aria-label="Stäng">
            ×
          </button>
        </div>

        <div className={styles.content}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
