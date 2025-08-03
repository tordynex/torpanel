import { useEffect, useState } from "react"

export function useWorkshop() {
  const [workshop, setWorkshop] = useState<any | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("currentWorkshop")
    if (stored) {
      setWorkshop(JSON.parse(stored))
    }
  }, [])

  return workshop
}
