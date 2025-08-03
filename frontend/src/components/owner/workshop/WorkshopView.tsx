import { useEffect, useState } from "react"
import { FaTools, FaTrash, FaEdit, FaPlus } from "react-icons/fa"
import workshopService from "@/services/workshopService"
import type { Workshop } from "@/services/workshopService"
import styles from "./WorkshopView.module.css"


export default function WorkshopView({
  onCreateToggle,
  onEditWorkshop,
}: {
  onCreateToggle: () => void
  onEditWorkshop: (workshop: Workshop) => void
}) {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    fetchWorkshops()
  }, [])

  const fetchWorkshops = async () => {
    try {
      const data = await workshopService.fetchWorkshops()
      setWorkshops(data)
    } catch (err) {
      console.error("Kunde inte hämta verkstäder", err)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await workshopService.deleteWorkshop(id)
      fetchWorkshops()
      setConfirmDelete(null)
    } catch (err) {
      console.error("Delete failed", err)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2>Verkstäder</h2>
        <button className={styles.addBtn} onClick={onCreateToggle}>
          <FaPlus /> Ny verkstad
        </button>
      </div>
      <div className={styles.grid}>
        {workshops.map((workshop) => (
          <div key={workshop.id} className={styles.card}>
            <div className={styles.icon}>
              <FaTools size={20} />
            </div>
            <div className={styles.info}>
              <h4>{workshop.name}</h4>
              <p>{workshop.email}</p>
              <p className={styles.city}>{workshop.city || "Stad saknas"}</p>
              <span className={styles.role}>
                {workshop.users.length} användare
              </span>
            </div>
            <div className={styles.actions}>
              <button
                onClick={() => onEditWorkshop(workshop)}
                className={styles.edit}
              >
                <FaEdit />
              </button>
              <button
                onClick={() =>
                  confirmDelete === workshop.id
                    ? handleDelete(workshop.id)
                    : setConfirmDelete(workshop.id)
                }
                className={styles.delete}
              >
                <FaTrash />
              </button>
            </div>
            {confirmDelete === workshop.id && (
              <p className={styles.confirm}>Är du säker på att du vill ta bort?</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
