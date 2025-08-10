// src/pages/workshop/WorkshopLayout.tsx
import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import styles from "./WorkshopLayout.module.css";
import { FaUsers, FaTachometerAlt, FaBook } from "react-icons/fa";
import { BsWrenchAdjustableCircle } from "react-icons/bs";
import userService from "@/services/userService";

export default function WorkshopLayout() {
  const location = useLocation();
  const auth = useAuth(); // null = ingen/fel/expired token
  const navigate = useNavigate();

  // Skydda alla /workshop/* här:
  if (!auth || auth.role !== "workshop_user") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    try {
      userService.logout?.(); // om den finns
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("currentUser");
      localStorage.removeItem("currentWorkshop");
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoWrapper}>
          <img src="/autonexo_logo.png" alt="Autonexo logo" className={styles.logo} />
        </div>
        <nav className={styles.nav}>
          <Link to="/workshop/" className={`${styles.navLink} ${isActive("/workshop/") ? styles.active : ""}`}>
            <FaTachometerAlt /> Översikt
          </Link>
          <Link to="/workshop/servicelog" className={`${styles.navLink} ${isActive("/workshop/servicelog") ? styles.active : ""}`}>
            <BsWrenchAdjustableCircle /> ServiceLog
          </Link>
          <Link to="/workshop/car-database" className={`${styles.navLink} ${isActive("/workshop/car-database") ? styles.active : ""}`}>
            <FaBook /> Bildatabas
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>Autonexo Partnerpanel</div>
          <button onClick={handleLogout} className={styles.logoutBtn}>Logga ut</button>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
