import { useState } from "react"
import WorkshopView from "../../components/owner/workshop/WorkshopView"
import WorkshopForm from "../../components/owner/workshop/WorkshopForm"
import type { Workshop } from "@/services/workshopService"

export default function WorkshopsPage() {
  const [showForm, setShowForm] = useState(false)
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null)

  const handleCreateToggle = () => {
    setSelectedWorkshop(null) // ny verkstad
    setShowForm(true)
  }

  const handleEditWorkshop = (workshop: Workshop) => {
    setSelectedWorkshop(workshop)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setSelectedWorkshop(null)
  }

  const handleSuccess = () => {
    setShowForm(false)
    setSelectedWorkshop(null)
  }

  return (
    <>
      {showForm ? (
        <WorkshopForm
          mode={selectedWorkshop ? "edit" : "create"}
          workshop={selectedWorkshop || undefined}
          onCancel={handleCancel}
          onSuccess={handleSuccess}
        />
      ) : (
        <WorkshopView
          onCreateToggle={handleCreateToggle}
          onEditWorkshop={handleEditWorkshop}
        />
      )}
    </>
  )
}
