import { useState } from "react"
import UserView from "../../components/owner/user/UserView"
import UserForm from "../../components/owner/user/UserForm"
import type { User } from "@/types/user";

export default function Users() {
  const [showForm, setShowForm] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const handleCreateToggle = () => {
    setSelectedUser(null) // ingen användare = skapa ny
    setShowForm(true)
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setSelectedUser(null)
  }

  const handleSuccess = () => {
    setShowForm(false)
    setSelectedUser(null)
  }

  return (
    <>
      {showForm ? (
        <UserForm
          mode={selectedUser ? "edit" : "create"}
          user={selectedUser || undefined}
          onCancel={handleCancel}
          onSuccess={handleSuccess}
        />
      ) : (
        <UserView
          onCreateToggle={handleCreateToggle}
          onEditUser={handleEditUser}
        />
      )}
    </>
  )
}
