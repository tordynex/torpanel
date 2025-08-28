import React, { useEffect, useMemo, useState } from "react";
import BayBookingCalendar from "@/components/workshop/calendar/BayBookingCalendar";
import EmployeeCalendar from "@/components/workshop/calendar/EmployeeCalendar";
import { useWorkshop } from "@/hooks/useWorkshops";
import { listUserBookingsWindow } from "@/services/userService";
import styles from "./css/Calendar.module.css";

type TokenPayload = {
  sub?: string;
  role?: string;
  username?: string;
  exp?: number;
  iat?: number;
};

function decodeJwt(token: string | null): TokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64url = parts[1];
    const base64 =
      base64url.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice((base64url.length + 3) % 4);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(base64), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type Mode = "bays" | "employees";

export default function Calendar() {
  const workshop = useWorkshop();

  // --- Token & användare ---
  const token = useMemo(() => localStorage.getItem("token") ?? null, []);
  const payload = useMemo(() => decodeJwt(token), [token]);

  const role = payload?.role ?? null;
  const userId = useMemo(() => {
    const n = Number(payload?.sub);
    return Number.isFinite(n) ? n : null;
  }, [payload?.sub]);
  const userName = useMemo(() => payload?.username ?? "vän", [payload?.username]);

  // --- Admin state (måste ligga ovillkorligt för att följa Rules of Hooks) ---
  const [mode, setMode] = useState<Mode>("bays");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [employeeEditable, setEmployeeEditable] = useState<boolean>(true);

  // Lista anställda + admins (memoiserad) — nu visas både 'workshop_employee' OCH 'workshop_user'
  const employees = useMemo(
    () =>
      (workshop?.users || []).filter((u: any) => {
        const r = (u.role ?? "").toString();
        return r === "workshop_employee" || r === "workshop_user";
      }),
    [workshop?.users]
  );

  // Sätt ett default-vald anställd för admin när data finns
  useEffect(() => {
    if (role !== "workshop_user") return;
    if (!employees.length) {
      setSelectedEmpId(null);
      return;
    }
    // Om nuvarande selected inte finns i listan → välj första
    if (
      selectedEmpId == null ||
      !employees.some((e: any) => Number(e.id) === Number(selectedEmpId))
    ) {
      setSelectedEmpId(Number(employees[0].id));
    }
  }, [role, employees, selectedEmpId]);

  // --- Tidiga guards (det är ok att returnera efter att hooks redan kallats) ---
  if (!workshop) return <div>Laddar verkstad...</div>;
  if (!payload || !role) return <div>Inte inloggad eller ogiltig token.</div>;

  // --- Anställd: alltid EmployeeCalendar, utan redigering ---
  if (role === "workshop_employee") {
    if (userId == null) {
      return <div>Fel: saknar userId i token.</div>;
    }
    return (
      <div
        key={`emp_wrapper_self_${userId ?? "x"}`}
        className={styles.container}
      >
        <EmployeeCalendar
          userId={userId}
          key={`emp_self_${userId ?? "x"}`}
          workshopId={workshop.id}
          employeeName={userName}
          loadBookingsForUser={listUserBookingsWindow}
          editable={false}
        />
      </div>
    );
  }

  // --- Admin: switch mellan Bås och Anställd-vy ---
  if (role === "workshop_user") {
    const selectedEmp =
      employees.find((u: any) => Number(u.id) === Number(selectedEmpId)) || null;

    const selectedEmpName =
      (selectedEmp?.username as string) ||
      [selectedEmp?.first_name, selectedEmp?.last_name].filter(Boolean).join(" ") ||
      selectedEmp?.email ||
      (selectedEmp ? `#${selectedEmp.id}` : "—");

    return (
      <div className={`${styles.container} ${styles.fill}`}>
        {/* Switcher */}
        <div className={styles.switcher}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${mode === "bays" ? styles.tabActive : ""}`}
              onClick={() => setMode("bays")}
            >
              Bås-kalender
            </button>
            <button
              className={`${styles.tab} ${mode === "employees" ? styles.tabActive : ""}`}
              onClick={() => setMode("employees")}
            >
              Anställdas scheman
            </button>
          </div>

          {mode === "employees" && (
            <div className={styles.empControls}>
              <label className={styles.label}>
                Anställd
                <select
                  className={styles.select}
                  value={selectedEmpId ?? ""}
                  onChange={(e) => setSelectedEmpId(e.target.value ? Number(e.target.value) : null)}
                >
                  {employees.map((u: any) => {
                    const name =
                      u.username ||
                      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                      u.email ||
                      `#${u.id}`;
                    return (
                      <option key={u.id} value={u.id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className={styles.checkLabel} title="Tillåt drag & drop i anställd-vyn">
                <input
                  type="checkbox"
                  checked={employeeEditable}
                  onChange={(e) => setEmployeeEditable(e.target.checked)}
                />
                Tillåt redigering (DnD)
              </label>
            </div>
          )}
        </div>

        {/* Innehåll */}
        {mode === "bays" ? (
          <BayBookingCalendar workshopId={workshop.id} />
        ) : !employees.length ? (
          <div className={styles.empty}>Inga anställda hittades.</div>
        ) : selectedEmpId == null ? (
          <div className={styles.empty}>Välj en anställd för att visa kalendern.</div>
        ) : (
          <div
            key={`emp_wrap_${selectedEmpId}`}
            className={`${styles.empWrapper} ${styles.fill}`}
          >
            <EmployeeCalendar
              userId={selectedEmpId}
              key={`emp_${selectedEmpId}`}
              workshopId={workshop.id}
              employeeName={selectedEmpName}
              loadBookingsForUser={listUserBookingsWindow}
              editable={employeeEditable}
            />
          </div>
        )}
      </div>
    );
  }

  return <div>Din roll ({role}) har ingen kalendervy här ännu.</div>;
}
