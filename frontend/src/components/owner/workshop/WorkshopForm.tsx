import { useEffect, useState } from "react"
import styles from "../user/UserForm.module.css"
import type { Workshop, WorkshopCreate } from "@/services/workshopService"
import {
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
} from "@/services/workshopService"
import userService from "@/services/userService"
import type { User } from "@/types/user"

interface WorkshopFormProps {
  mode: "create" | "edit"
  workshop?: Workshop
  onCancel: () => void
  onSuccess: () => void
}

export default function WorkshopForm({
  mode,
  workshop,
  onCancel,
  onSuccess,
}: WorkshopFormProps) {
  const isEdit = mode === "edit"

  const [formData, setFormData] = useState<WorkshopCreate>({
    name: "",
    email: "",
    phone: "",
    website: "",
    street_address: "",
    postal_code: "",
    city: "",
    country: "",
    latitude: undefined,
    longitude: undefined,
    org_number: "",
    active: true,
    opening_hours: "",
    notes: "",
    user_ids: [],
  })


  const [confirmDelete, setConfirmDelete] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])

  useEffect(() => {
  const loadUsers = async () => {
    try {
      const all = await userService.fetchUsers()
      setAvailableUsers(all.filter((u) => u.role === "workshop_user"))
    } catch (err) {
      console.error("Kunde inte hämta användare", err)
    }
  }

  loadUsers()

  if (isEdit && workshop) {
    setFormData({
      name: workshop.name,
      email: workshop.email,
      phone: workshop.phone,
      website: workshop.website || "",
      street_address: workshop.street_address,
      postal_code: workshop.postal_code,
      city: workshop.city,
      country: workshop.country,
      latitude: workshop.latitude,
      longitude: workshop.longitude,
      org_number: workshop.org_number || "",
      active: workshop.active,
      opening_hours: workshop.opening_hours || "",
      notes: workshop.notes || "",
      user_ids: workshop.users.map((u) => u.id),
    })
  }
}, [isEdit, workshop])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target
    const val = type === "number" ? parseFloat(value) : value
    setFormData((prev) => ({ ...prev, [name]: val }))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (isEdit && workshop) {
        await updateWorkshop(workshop.id, formData)
      } else {
        await createWorkshop(formData)
      }
      onSuccess()
    } catch (err) {
      console.error("Fel vid inskickning", err)
    }
  }

  const handleDelete = async () => {
    if (!workshop) return
    try {
      await deleteWorkshop(workshop.id)
      onSuccess()
    } catch (err) {
      console.error("Fel vid radering", err)
    }
  }

  return (
    <div className={styles.formWrapper}>
      <h3>{isEdit ? "Redigera verkstad" : "Skapa ny verkstad"}</h3>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          Namn
          <input
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          E-post
          <input
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Telefonnummer
          <input name="phone" type="text" value={formData.phone} onChange={handleChange} required />
        </label>
        <label>
          Gatuadress
          <input name="street_address" type="text" value={formData.street_address} onChange={handleChange} required />
        </label>
        <label>
          Postnummer
          <input name="postal_code" type="text" value={formData.postal_code} onChange={handleChange} required />
        </label>
        <label>
          Stad
          <input
            name="city"
            type="text"
            value={formData.city}
            onChange={handleChange}
          />
        </label>
        <label>
          Land
          <input name="country" type="text" value={formData.country} onChange={handleChange} required />
        </label>
        <label>
          Latitud
          <input name="latitude" type="number" step="any" value={formData.latitude ?? ""} onChange={handleChange} />
        </label>
        <label>
          Longitud
          <input name="longitude" type="number" step="any" value={formData.longitude ?? ""} onChange={handleChange} />
        </label>
        <label>
          Hemsida
          <input name="website" type="url" value={formData.website || ""} onChange={handleChange} />
        </label>
        <label>
          Organisationsnummer
          <input name="org_number" type="text" value={formData.org_number || ""} onChange={handleChange} />
        </label>
        <label>
          Öppettider
          <input name="opening_hours" type="text" value={formData.opening_hours || ""} onChange={handleChange} />
        </label>
        <label>
          Anteckningar
          <input name="notes" type="text" value={formData.notes || ""} onChange={handleChange} />
        </label>
        <label>
          Aktiv
          <input
            name="active"
            type="checkbox"
            checked={formData.active}
            onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.checked }))}
          />
        </label>
        <label>
          Koppla till användare (workshop_user)
          {availableUsers.length === 0 ? (
            <p>Finns ej någon användare med rollen "workshop_user".</p>
          ) : (
            <select
              multiple
              value={formData.user_ids}
              onChange={(e) => {
                const selectedOptions = Array.from(e.target.selectedOptions).map((opt) =>
                  parseInt(opt.value)
                )
                setFormData((prev) => ({ ...prev, user_ids: selectedOptions }))
              }}
              className={styles.selectBox}
            >
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username} ({user.email})
                </option>
              ))}
            </select>
          )}
        </label>

        {/* Här kan man lägga till användarval om det behövs i framtiden */}

        <div className={styles.buttons}>
          <button type="submit" className={styles.saveBtn}>
            {isEdit ? "Spara ändringar" : "Skapa verkstad"}
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Avbryt
          </button>
        </div>

        {isEdit && (
          <div className={styles.deleteSection}>
            {confirmDelete ? (
              <>
                <p className={styles.confirmText}>Är du säker på att du vill ta bort?</p>
                <button className={styles.deleteBtn} onClick={handleDelete}>
                  Ja, radera
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setConfirmDelete(false)}
                >
                  Nej
                </button>
              </>
            ) : (
              <button
                className={styles.deleteInitBtn}
                onClick={() => setConfirmDelete(true)}
              >
                Radera verkstad
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
