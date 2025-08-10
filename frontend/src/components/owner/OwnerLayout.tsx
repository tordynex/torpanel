// src/pages/owner/OwnerLayout.tsx
import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import styles from "./OwnerLayout.module.css";
import { FaUsers, FaTachometerAlt, FaBook } from "react-icons/fa";
import { BiSolidCarMechanic } from "react-icons/bi";
import { BsWrenchAdjustableCircle } from "react-icons/bs";
import userService from "@/services/userService";

export default function OwnerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth(); // null = ogiltig/utgången/ej inloggad

  // 1) Ingen giltig token -> till login
  if (!auth) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // 2) Fel roll -> skicka vidare på ett vettigt sätt
  if (auth.role !== "owner") {
    // Om det är en workshop-användare, skicka till deras panel, annars login
    const fallback = auth.role === "workshop_user" ? "/workshop" : "/login";
    return <Navigate to={fallback} replace />;
  }

  // Aktiv-länk: startsWith för att stödja undersidor (t.ex. /owner/users/123)
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const handleLogout = () => {
    try {
      userService.logout?.(); // om din service har en logout
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
          <Link
            to="/owner/"
            className={`${styles.navLink} ${isActive("/owner") ? styles.active : ""}`}
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
