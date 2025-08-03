import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth"
import styles from "./OwnerLayout.module.css";
import { FaUsers, FaTachometerAlt } from "react-icons/fa";
import { BiSolidCarMechanic } from "react-icons/bi";
import { FaBook } from "react-icons/fa";
import { BsWrenchAdjustableCircle } from "react-icons/bs";
import userService from "@/services/userService"


export default function OwnerLayout() {
  const location = useLocation();
  const auth = useAuth()

  if (!auth || auth.role !== "owner") {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isActive = (path: string) => location.pathname === path;

  const navigate = useNavigate()

  const handleLogout = () => {
    userService.logout()
    navigate("/login")
  }

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoWrapper}>
          <img src="/autonexo_logo.png" alt="Autonexo logo" className={styles.logo} />
        </div>
        <nav className={styles.nav}>
          <Link
            to="/owner/"
            className={`${styles.navLink} ${isActive("/owner/") ? styles.active : ""}`}
          >
            <FaTachometerAlt /> Dashboard
          </Link>
          <Link
            to="/owner/users"
            className={`${styles.navLink} ${isActive("/owner/users") ? styles.active : ""}`}
          >
            <FaUsers /> Users
          </Link>
          <Link
            to="/owner/workshops"
            className={`${styles.navLink} ${isActive("/owner/workshops") ? styles.active : ""}`}
          >
            <BiSolidCarMechanic /> Workshops
          </Link>
          <Link
            to="/owner/cars"
            className={`${styles.navLink} ${isActive("/owner/cars") ? styles.active : ""}`}
          >
            <FaBook /> Cars
          </Link>
          <Link
            to="/owner/servicelogs"
            className={`${styles.navLink} ${isActive("/owner/servicelogs") ? styles.active : ""}`}
          >
            <BsWrenchAdjustableCircle /> Servicelogs
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>Autonexo Adminpanel</div>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Logga ut
          </button>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
