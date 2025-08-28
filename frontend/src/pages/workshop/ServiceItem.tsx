import { useNavigate } from "react-router-dom"
import styles from "./css/ServiceItem.module.css"
import ServiceItemList from "@/components/workshop/ServiceItemList"
import { useWorkshop } from "@/hooks/useWorkshops"

export default function ServiceItemPage() {
  const navigate = useNavigate()
  const ws = useWorkshop()
  const wid = ws?.id ?? null

  return (
    <div className={styles.wrapper}>

      {wid ? (
        <ServiceItemList workshopId={wid} />
      ) : (
        <div style={{ padding: 16, color: "var(--muted)" }}>
          Ingen verkstad hittades.
        </div>
      )}

      <div className={styles.footer}>
        <span>
          <span className={styles.footerStrong}>Autonexo</span> • Partnerpanel
        </span>
        <div className={styles.footerRight}>
          Tjänster · {new Date().toLocaleDateString("sv-SE")}
        </div>
      </div>
    </div>
  )
}
