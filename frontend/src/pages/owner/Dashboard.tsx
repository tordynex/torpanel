import { useEffect, useState } from "react"
import workshopService from "@/services/workshopService"
import carService from "@/services/carService"
import styles from "./Dashboard.module.css"
import MakeNews from "@/components/owner/dashboard/MakeNews.tsx";
import NewsBox from "@/components/workshop/dashboard/NewsBox.tsx";


export default function Dashboard() {
  const [workshopCount, setWorkshopCount] = useState<number | null>(null)
  const [carCount, setCarCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [workshops, cars] = await Promise.all([
          workshopService.fetchWorkshops(),
          carService.fetchAllCars(),
        ])
        setWorkshopCount(workshops.length)
        setCarCount(cars.length)
      } catch (error) {
        console.error("Kunde inte hämta dashboard-data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
   <div className={styles.background}>
       <img className={styles.logga} src="/autonexo_logo_black.png" alt="Autonexo Logga png" />
    <div className={styles.dashboard}>

      {loading ? (
        <p>Laddar data...</p>
      ) : (
        <div className={styles.statsGrid}>
          <div className={styles.card}>
            <h3>Verkstäder anslutna</h3>
            <p className={styles.value}>{workshopCount}</p>
          </div>

          <div className={styles.card}>
            <h3>Bilar i systemet</h3>
            <p className={styles.value}>{carCount}</p>
          </div>
        </div>
      )}
      <div className={styles.statsGrid}>
        <div className={styles.newsbox}>
          <MakeNews/>
        </div>
        <div className={styles.newsbox}>
          <NewsBox/>
        </div>
      </div>
    </div>
   </div>
  )
}
