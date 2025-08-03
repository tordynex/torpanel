import { useState, useEffect } from "react";
import styles from "./UserForm.module.css";
import type { User, UserCreate } from "@/types/user";
import {
  createUser,
  updateUser,
  deleteUser,
} from "@/services/userService";
import { fetchWorkshops } from "@/services/workshopService"
import type { Workshop } from "@/services/workshopService"

interface UserFormProps {
  mode: "create" | "edit";
  user?: User;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function UserForm({ mode, user, onCancel, onSuccess }: UserFormProps) {
  const isEdit = mode === "edit";

  const [formData, setFormData] = useState<UserCreate>({
    username: "",
    email: "",
    password: "",
    role: "workshop_user",
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [availableWorkshops, setAvailableWorkshops] = useState<Workshop[]>([])

  // Uppdatera formData om användare skickas in för redigering
  useEffect(() => {
  const loadWorkshops = async () => {
    try {
      const all = await fetchWorkshops()
      setAvailableWorkshops(all)
    } catch (err) {
      console.error("Kunde inte hämta workshops", err)
    }
  }

  loadWorkshops()

  if (isEdit && user) {
    setFormData({
      username: user.username,
      email: user.email,
      password: "",
      role: user.role,
      workshop_ids: user.workshops?.map(w => w.id) || [],
    })
  }
}, [isEdit, user])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit && user) {
        await updateUser(user.id, formData);
      } else {
        await createUser(formData);
      }
      onSuccess();
    } catch (err) {
      console.error("Error submitting form", err);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteUser(user.id);
      onSuccess();
    } catch (err) {
      console.error("Error deleting user", err);
    }
  };

  return (
    <div className={styles.formWrapper}>
      <h3>{isEdit ? "Redigera användare" : "Skapa ny användare"}</h3>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          Användarnamn
          <input
            name="username"
            type="text"
            value={formData.username}
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
          Roll
          <select name="role" value={formData.role} onChange={handleChange}>
            <option value="owner">Ägare</option>
            <option value="workshop_user">Verkstadsanvändare</option>
          </select>
        </label>
        {formData.role === "workshop_user" && (
          <label>
            Koppla till verkstad
            {availableWorkshops.length === 0 ? (
              <p>Inga verkstäder tillgängliga.</p>
            ) : (
              <select
                multiple
                value={formData.workshop_ids}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(opt => parseInt(opt.value))
                  setFormData(prev => ({ ...prev, workshop_ids: selected }))
                }}
                className={styles.selectBox}
              >
                {availableWorkshops.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} – {w.city}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
        <label>
          Lösenord
          <input
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required={!isEdit} // lösenord bara obligatoriskt vid skapande
          />
        </label>

        <div className={styles.buttons}>
          <button type="submit" className={styles.saveBtn}>
            {isEdit ? "Spara ändringar" : "Skapa användare"}
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
                Radera användare
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
