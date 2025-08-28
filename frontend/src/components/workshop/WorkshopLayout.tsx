import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkshop } from "@/hooks/useWorkshops";
import styles from "./css/WorkshopLayout.module.css";
import { FaUsers, FaTachometerAlt, FaCalendarAlt, FaCog } from "react-icons/fa";
import { BsWrenchAdjustableCircle } from "react-icons/bs";
import { GiMechanicGarage } from "react-icons/gi";
import { GrCatalogOption } from "react-icons/gr";
import userService from "@/services/userService";

export default function WorkshopLayout() {
  const location = useLocation();
  const auth = useAuth(); // null = ingen/fel/expired token
  const workshop = useWorkshop();
  const navigate = useNavigate();

  // Skydda alla /workshop/*
  if (!auth || !["workshop_user", "workshop_employee"].includes(auth.role)) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname === path.replace(/\/$/, "");

  // aktivt inom Inställningar?
  const settingsPaths = ["/workshop/service-item", "/workshop/servicebays", "/workshop/users"];
  const isSettingsActive = settingsPaths.some((p) => isActive(p));

  const handleLogout = async () => {
      try {
        await userService.logout()
      } catch (err) {
        console.error("Logout error", err)
      } finally {
        localStorage.removeItem("token")
        localStorage.removeItem("currentUser")
        localStorage.removeItem("currentWorkshop")
        navigate("/login", { replace: true })
      }
    }


  const userName = auth?.username ?? "Användare";
  const workshopLabel = workshop
    ? `${workshop.name}${workshop.city ? ` • ${workshop.city}` : ""}`
    : "Laddar verkstad…";

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logoWrapper}>
          <img src="/autonexo_logo.png" alt="Autonexo logo" className={styles.logo} />
        </div>

        <nav className={styles.nav}>
          <Link
            to="/workshop/"
            className={`${styles.navLink} ${isActive("/workshop/") ? styles.active : ""}`}
          >
            <FaTachometerAlt /> Översikt
          </Link>

          <Link
            to="/workshop/servicelog"
            className={`${styles.navLink} ${isActive("/workshop/servicelog") ? styles.active : ""}`}
          >
            <BsWrenchAdjustableCircle /> ServiceLog
          </Link>

          <Link
            to="/workshop/calendar"
            className={`${styles.navLink} ${isActive("/workshop/calendar") ? styles.active : ""}`}
          >
            <FaCalendarAlt /> Bokningar
          </Link>

          {/* Inställningar-grupp (rubrik + underlänkar) */}
          {auth.role === "workshop_user" && (
            <div className={styles.group}>
              <div className={`${styles.groupLabel} ${isSettingsActive ? styles.active : ""}`}>
                <FaCog className={styles.groupIcon} /> Inställningar
              </div>
              <div className={styles.subNav}>
                <Link
                  to="/workshop/service-item"
                  className={`${styles.subNavLink} ${isActive("/workshop/service-item") ? styles.active : ""}`}
                >
                  <GrCatalogOption /> Tjänstekatalog
                </Link>
                <Link
                  to="/workshop/servicebays"
                  className={`${styles.subNavLink} ${isActive("/workshop/servicebays") ? styles.active : ""}`}
                >
                  <GiMechanicGarage /> Arbetsplatser
                </Link>
                <Link
                  to="/workshop/users"
                  className={`${styles.subNavLink} ${isActive("/workshop/users") ? styles.active : ""}`}
                >
                  <FaUsers /> Användare
                </Link>
              </div>
            </div>
          )}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>Autonexo Partnerpanel</div>

          {/* NYTT: badge med Namn | Verkstad + Logga ut */}
          <div className={styles.headerRight}>
            <div className={styles.headerBadge} title={`${userName} | ${workshopLabel}`}>
              <span className={styles.headerName}>{userName}</span>
              <span className={styles.sep}>|</span>
              <span className={styles.headerWorkshop}>{workshopLabel}</span>
            </div>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logga ut
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
