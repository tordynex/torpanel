import { useEffect, useState } from "react"
import styles from "./WorkshopForm.module.css"
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
    autonexo: true,
    opening_hours: "",
    notes: "",
    user_ids: [],
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Roller som får kopplas till verkstad (oförändrad funktionalitet – bara tydliggjort)
  const LINKABLE_ROLES = ["workshop_user", "workshop_employee"] as const

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const all = await userService.fetchUsers()
        setAvailableUsers(all.filter((u) => LINKABLE_ROLES.includes(u.role as any)))
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
        autonexo: workshop.autonexo,
        opening_hours: workshop.opening_hours || "",
        notes: workshop.notes || "",
        user_ids: workshop.users.map((u) => u.id),
      })
    }
  }, [isEdit, workshop])

  // Hjälpare som inte förändrar funktionalitet men undviker NaN i state
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target
    if (type === "number") {
      // Tomt => undefined (istället för NaN). Skickas inte som ogiltigt tal.
      const v = value === "" ? undefined : parseFloat(value)
      setFormData((prev) => ({ ...prev, [name]: v as any }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      if (isEdit && workshop) {
        await updateWorkshop(workshop.id, formData)
      } else {
        await createWorkshop(formData)
      }
      onSuccess()
    } catch (err) {
      console.error("Fel vid inskickning", err)
    } finally {
      setSubmitting(false)
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
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          {isEdit ? "Redigera verkstad" : "Skapa ny verkstad"}
        </h3>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCancel}
            aria-label="Avbryt"
          >
            Avbryt
          </button>

          <button
            type="submit"
            form="workshop-form"
            className={styles.primaryBtn}
            disabled={submitting}
            aria-busy={submitting}
          >
            {isEdit ? "Spara ändringar" : "Skapa verkstad"}
          </button>
        </div>
      </div>

      <form id="workshop-form" onSubmit={handleSubmit} className={styles.form}>
        {/* Sektion: Grunduppgifter */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h4>Grunduppgifter</h4>
            <p className={styles.muted}>Basinformation om verkstaden</p>
          </div>

          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>Namn</span>
              <input
                name="name"
                type="text"
                placeholder="Ex. Autonexo Bil & Motor"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </label>

            <label className={styles.field}>
              <span>E-post</span>
              <input
                name="email"
                type="email"
                placeholder="info@exempel.se"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Telefonnummer</span>
              <input
                name="phone"
                type="text"
                placeholder="070-123 45 67"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Hemsida</span>
              <input
                name="website"
                type="url"
                placeholder="https://exempel.se"
                value={formData.website || ""}
                onChange={handleChange}
              />
            </label>

            <label className={styles.field}>
              <span>Organisationsnummer</span>
              <input
                name="org_number"
                type="text"
                placeholder="556123-4567"
                value={formData.org_number || ""}
                onChange={handleChange}
              />
            </label>

            <label className={`${styles.field} ${styles.switchRow}`}>
              <span>Aktiv</span>
              <input
                name="active"
                type="checkbox"
                checked={formData.active}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, active: e.target.checked }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.switchRow}`}>
              <span>Autonexo auktoriserad</span>
              <input
                name="autonexo"
                type="checkbox"
                checked={formData.autonexo}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, autonexo: e.target.checked }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Öppettider</span>
              <input
                name="opening_hours"
                type="text"
                placeholder="Ex. Mån–Fre 08–17"
                value={formData.opening_hours || ""}
                onChange={handleChange}
              />
            </label>

            <label className={styles.fieldFull}>
              <span>Anteckningar</span>
              <input
                name="notes"
                type="text"
                placeholder="Valfria interna anteckningar"
                value={formData.notes || ""}
                onChange={handleChange}
              />
            </label>
          </div>
        </section>

        {/* Sektion: Adress */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h4>Adress</h4>
            <p className={styles.muted}>Besöksadress och ort</p>
          </div>

          <div className={styles.grid2}>
            <label className={styles.fieldFull}>
              <span>Gatuadress</span>
              <input
                name="street_address"
                type="text"
                placeholder="Ex. Mekargatan 1"
                value={formData.street_address}
                onChange={handleChange}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Postnummer</span>
              <input
                name="postal_code"
                type="text"
                placeholder="123 45"
                value={formData.postal_code}
                onChange={handleChange}
                required
              />
            </label>

            <label className={styles.field}>
              <span>Stad</span>
              <input
                name="city"
                type="text"
                placeholder="Ex. Kalmar"
                value={formData.city}
                onChange={handleChange}
              />
            </label>

            <label className={styles.field}>
              <span>Land</span>
              <input
                name="country"
                type="text"
                placeholder="Ex. Sverige"
                value={formData.country}
                onChange={handleChange}
                required
              />
            </label>
          </div>
        </section>

        {/* Sektion: Koordinater */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h4>Koordinater</h4>
            <p className={styles.muted}>Valfritt – för karta/sök</p>
          </div>

          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>Latitud</span>
              <input
                name="latitude"
                type="number"
                step="any"
                placeholder="Ex. 59.329"
                value={formData.latitude ?? ""}
                onChange={handleChange}
              />
            </label>

            <label className={styles.field}>
              <span>Longitud</span>
              <input
                name="longitude"
                type="number"
                step="any"
                placeholder="Ex. 18.068"
                value={formData.longitude ?? ""}
                onChange={handleChange}
              />
            </label>
          </div>
        </section>

        {/* Sektion: Användare */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h4>Användare kopplade till verkstaden</h4>
            <p className={styles.muted}>
              Välj användare med rollerna <strong>workshop_user</strong> eller <strong>workshop_employee</strong>
              . Håll Ctrl/Cmd för att markera flera.
            </p>
          </div>

          <div className={styles.fieldBlock}>
            {availableUsers.length === 0 ? (
              <p className={styles.muted}>
                Finns ej någon användare med rollerna &quot;workshop_user&quot; eller
                &quot;workshop_employee&quot;.
              </p>
            ) : (
              <select
                multiple
                value={formData.user_ids}
                onChange={(e) => {
                  const selectedOptions = Array.from(e.target.selectedOptions).map((opt) =>
                    parseInt(opt.value, 10)
                  )
                  setFormData((prev) => ({ ...prev, user_ids: selectedOptions }))
                }}
                className={styles.selectBox}
                aria-label="Välj användare"
              >
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.email}) — {user.role}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Sektion: Radera (endast edit) */}
        {isEdit && (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <div className={styles.cardHeader}>
              <h4>Radera verkstad</h4>
              <p className={styles.muted}>
                Detta går inte att ångra. All koppling till användare tas bort.
              </p>
            </div>

            {!confirmDelete ? (
              <button
                type="button"
                className={styles.deleteInitBtn}
                onClick={() => setConfirmDelete(true)}
              >
                Radera verkstad
              </button>
            ) : (
              <div className={styles.confirmRow}>
                <p className={styles.confirmText}>Är du säker på att du vill ta bort?</p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={handleDelete}
                  >
                    Ja, radera
                  </button>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Nej
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </form>
    </div>
  )
}
