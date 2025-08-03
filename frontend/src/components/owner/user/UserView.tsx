import { useEffect, useState } from "react";
import { FaTrash, FaEdit, FaPlus, FaUser } from "react-icons/fa";
import userService from "@/services/userService";
import styles from "./UserView.module.css";
import UserForm from "./UserForm.tsx"

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export default function UserView({
  onCreateToggle,
  onEditUser,
}: {
  onCreateToggle: () => void;
  onEditUser: (user: User) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await userService.fetchUsers();
      setUsers(data);
    } catch (err) {
      console.error("Error fetching users", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userService.deleteUser(id);
      fetchUsers();
      setConfirmDelete(null);
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2>Användare</h2>
        <button className={styles.addBtn} onClick={onCreateToggle}>
          <FaPlus /> Ny användare
        </button>
      </div>
      <div className={styles.grid}>
        {users.map((user) => (
          <div key={user.id} className={styles.card}>
            <div className={styles.icon}><FaUser size={20} /></div>
            <div className={styles.info}>
              <h4>{user.username}</h4>
              <p>{user.email}</p>
              <span className={styles.role}>{user.role}</span>
            </div>
            <div className={styles.actions}>
              <button onClick={() => onEditUser(user)} className={styles.edit}>
                <FaEdit />
              </button>
              <button
                onClick={() =>
                  confirmDelete === user.id ? handleDelete(user.id) : setConfirmDelete(user.id)
                }
                className={styles.delete}
              >
                <FaTrash />
              </button>
            </div>
            {confirmDelete === user.id && (
              <p className={styles.confirm}>Är du säker på att du vill ta bort?</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
