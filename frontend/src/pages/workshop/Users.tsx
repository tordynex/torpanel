// src/pages/workshop/WorkshopUsersPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkshop } from "@/hooks/useWorkshops";
import type {
  User,
  UserCreate,
  UserWorkingHoursCreate,
  UserWorkingHours,
  UserTimeOff,
  UserTimeOffCreate,
  TimeOffType,
} from "@/services/userService";
import userApi, {
  listWorkingHours as apiListWorkingHours,
  createWorkingHours as apiCreateWorkingHours,
  deleteWorkingHours as apiDeleteWorkingHours,
  setOfficeHours as apiSetOfficeHours,
  setWorkingHoursWithLunch as apiSetWorkingHoursWithLunch,
  listTimeOff as apiListTimeOff,
  createTimeOff as apiCreateTimeOff,
  deleteTimeOff as apiDeleteTimeOff,
} from "@/services/userService";

import Modal from "@/components/common/Modal";

// Ikoner
import {
  FiUserPlus,
  FiUsers,
  FiClock,
  FiTrash2,
  FiCalendar,
  FiPlus,
  FiX,
  FiCoffee,
  FiSun,
  FiSettings,
  FiSave,
} from "react-icons/fi";

import styles from "./css/UsersPage.module.css";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"] as const;
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;

function toHms(t: string) {
  // "08:00" -> "08:00:00", "08:00:59" lämnas orörd
  return t.length === 5 ? `${t}:00` : t;
}

function sortWH(a: UserWorkingHours, b: UserWorkingHours) {
  if (a.weekday !== b.weekday) return a.weekday - b.weekday;
  return a.start_time.localeCompare(b.start_time);
}

/** Små UI-hjälpare (utan att ändra logik) */
function SectionTitle({
  icon,
  children,
}: {
  icon: JSX.Element;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.cardTitle} style={{ alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function InlineHelp({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.muted} style={{ fontSize: 12 }}>
      {children}
    </span>
  );
}

export default function WorkshopUsersPage() {
  const auth = useAuth();
  const userName = useMemo(() => auth?.username ?? "användare", [auth]);
  const userRole = auth?.role;
  const workshop = useWorkshop();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Skapa användare
  const [email, setEmail] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Arbetstider / Frånvaro modal state
  const [scheduleOpenFor, setScheduleOpenFor] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"hours" | "timeoff">("hours");

  // Hours state
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [workingHours, setWorkingHours] = useState<UserWorkingHours[]>([]);
  const [weekday, setWeekday] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [validFrom, setValidFrom] = useState<string>("");
  const [validTo, setValidTo] = useState<string>("");

  // Lunch (rast)
  const [withLunch, setWithLunch] = useState<boolean>(true);
  const [lunchStart, setLunchStart] = useState<string>("12:00");
  const [lunchEnd, setLunchEnd] = useState<string>("13:00");

  // Time-off state
  const [timeOffLoading, setTimeOffLoading] = useState(false);
  const [timeOffError, setTimeOffError] = useState<string | null>(null);
  const [timeOff, setTimeOff] = useState<UserTimeOff[]>([]);
  const [toStart, setToStart] = useState<string>(""); // datetime-local
  const [toEnd, setToEnd] = useState<string>(""); // datetime-local
  const [toType, setToType] = useState<TimeOffType>("vacation");
  const [toReason, setToReason] = useState<string>("");

  // Hämta users för aktuell verkstad
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!workshop?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const all = await userApi.fetchUsers();
        const filtered = all.filter((u) =>
          u.workshops?.some((w) => w.id === workshop.id)
        );
        if (mounted) setUsers(filtered);
      } catch {
        if (mounted) setError("Kunde inte hämta användare.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [workshop?.id]);

  // Rollvakt
  if (userRole && userRole !== "workshop_user") {
    return (
      <div className={styles.page}>
        <div className={styles.denied}>
          Du måste vara <strong>verkstadsägare (workshop_user)</strong> för att hantera
          användare i denna vy.
        </div>
      </div>
    );
  }

  /*** CRUD: Users ***/
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workshop?.id) {
      setCreateMsg("Ingen verkstad vald.");
      return;
    }
    if (!email || !usernameInput || !password) {
      setCreateMsg("Fyll i alla fält.");
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const payload: UserCreate = {
        email,
        username: usernameInput,
        password,
        role: "workshop_employee",
        workshop_ids: [workshop.id],
      };
      const created = await userApi.createUser(payload);
      setUsers((prev) => [created, ...prev]);
      setEmail("");
      setUsernameInput("");
      setPassword("");
      setCreateMsg("Användare skapad och kopplad till verkstaden ✔");
    } catch (err: any) {
      setCreateMsg(err?.response?.data?.detail ?? "Kunde inte skapa användare.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm("Ta bort användaren?")) return;
    try {
      await userApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      alert("Kunde inte ta bort användaren.");
    }
  };

  /*** Modal open/close ***/
  const openSchedule = async (user: User) => {
    setScheduleOpenFor(user);
    setActiveTab("hours");
    setScheduleError(null);
    setTimeOffError(null);
    setWorkingHours([]);
    setTimeOff([]);
    setScheduleLoading(true);
    setTimeOffLoading(true);
    try {
      const [wh, to] = await Promise.all([
        apiListWorkingHours(user.id),
        apiListTimeOff(user.id),
      ]);
      setWorkingHours(wh.sort(sortWH));
      setTimeOff(to);
    } catch {
      setScheduleError("Kunde inte hämta arbetstider.");
      setTimeOffError("Kunde inte hämta frånvaro.");
    } finally {
      setScheduleLoading(false);
      setTimeOffLoading(false);
    }
  };

  const closeSchedule = () => {
    setScheduleOpenFor(null);
    setScheduleError(null);
    setTimeOffError(null);
    setWorkingHours([]);
    setTimeOff([]);
  };

  /*** Working hours helpers ***/
  const addWorkingHour = async () => {
    if (!scheduleOpenFor) return;
    if (!startTime || !endTime) {
      setScheduleError("Ange start- och sluttid.");
      return;
    }
    const start = toHms(startTime);
    const end = toHms(endTime);
    try {
      if (withLunch) {
        // Skapa två pass runt lunchen
        const lunchS = toHms(lunchStart);
        const lunchE = toHms(lunchEnd);

        const morning: UserWorkingHoursCreate = {
          user_id: scheduleOpenFor.id,
          weekday,
          start_time: start,
          end_time: lunchS,
          valid_from: validFrom || null,
          valid_to: validTo || null,
        };
        const afternoon: UserWorkingHoursCreate = {
          user_id: scheduleOpenFor.id,
          weekday,
          start_time: lunchE,
          end_time: end,
          valid_from: validFrom || null,
          valid_to: validTo || null,
        };

        const [c1, c2] = await Promise.all([
          apiCreateWorkingHours(scheduleOpenFor.id, morning),
          apiCreateWorkingHours(scheduleOpenFor.id, afternoon),
        ]);
        setWorkingHours((prev) => [...prev, c1, c2].sort(sortWH));
      } else {
        const payload: UserWorkingHoursCreate = {
          user_id: scheduleOpenFor.id,
          weekday,
          start_time: start,
          end_time: end,
          valid_from: validFrom || null,
          valid_to: validTo || null,
        };
        const created = await apiCreateWorkingHours(scheduleOpenFor.id, payload);
        setWorkingHours((prev) => [...prev, created].sort(sortWH));
      }
      setScheduleError(null);
    } catch (e: any) {
      setScheduleError(e?.response?.data?.detail ?? "Kunde inte spara arbetstid.");
    }
  };

  const removeWorkingHour = async (whId: number) => {
    if (!scheduleOpenFor) return;
    if (!confirm("Ta bort denna arbetstid?")) return;
    try {
      await apiDeleteWorkingHours(whId);
      setWorkingHours((prev) => prev.filter((w) => w.id !== whId));
    } catch {
      setScheduleError("Kunde inte ta bort arbetstiden.");
    }
  };

  const applyOfficePreset = async () => {
    if (!scheduleOpenFor) return;
    if (!confirm("Skriv över befintliga arbetstider med 08–17 mån–fre?")) return;
    try {
      const data = await apiSetOfficeHours(scheduleOpenFor.id);
      setWorkingHours([...data].sort(sortWH));
      setScheduleError(null);
    } catch {
      setScheduleError("Kunde inte sätta preset.");
    }
  };

  const applyOfficePresetWithLunch = async () => {
    if (!scheduleOpenFor) return;
    if (
      !confirm(
        `Skriv över tider med 08–17 mån–fre och lunch ${lunchStart}–${lunchEnd}?`
      )
    )
      return;
    try {
      const data = await apiSetWorkingHoursWithLunch(scheduleOpenFor.id, {
        weekdays: [0, 1, 2, 3, 4],
        start_time: toHms("08:00"),
        lunch_start: toHms(lunchStart),
        lunch_end: toHms(lunchEnd),
        end_time: toHms("17:00"),
        valid_from: validFrom || null,
        valid_to: validTo || null,
      });
      setWorkingHours([...data].sort(sortWH));
      setScheduleError(null);
    } catch {
      setScheduleError("Kunde inte sätta preset med lunch.");
    }
  };

  /*** Time-off helpers ***/
  const addTimeOff = async () => {
    if (!scheduleOpenFor) return;
    if (!toStart || !toEnd) {
      setTimeOffError("Välj start och slut för frånvaro.");
      return;
    }
    try {
      const payload: UserTimeOffCreate = {
        user_id: scheduleOpenFor.id,
        start_at: new Date(toStart).toISOString(),
        end_at: new Date(toEnd).toISOString(),
        type: toType,
        reason: toReason || null,
      };
      const created = await apiCreateTimeOff(scheduleOpenFor.id, payload);
      setTimeOff((prev) => [created, ...prev]);
      setToStart("");
      setToEnd("");
      setToType("vacation");
      setToReason("");
      setTimeOffError(null);
    } catch (e: any) {
      setTimeOffError(e?.response?.data?.detail ?? "Kunde inte spara frånvaro.");
    }
  };

  const removeTimeOff = async (id: number) => {
    if (!scheduleOpenFor) return;
    if (!confirm("Ta bort denna frånvaropost?")) return;
    try {
      await apiDeleteTimeOff(id);
      setTimeOff((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setTimeOffError("Kunde inte ta bort frånvaroposten.");
    }
  };

  const workshopName = workshop?.name ?? "—";
  const workshopCity = workshop?.city ?? "—";

  return (
    <div className={styles.page} style={{ background: "#fff" }}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerRight}>
          <button className={styles.ghostBtn} onClick={() => location.reload()}>
            <FiRefreshCwFallback /> Uppdatera
          </button>
        </div>
      </header>

      <section className={styles.grid}>
        {/* Vänster: skapa anställd */}
        <div className={styles.card}>
          <SectionTitle icon={<FiUserPlus className={styles.cardTitleIcon} />}>
            Lägg till verkstadsanställd
          </SectionTitle>

          {!workshop?.id ? (
            <div className={styles.placeholder}>Ingen verkstad vald.</div>
          ) : (
            <form className={styles.form} onSubmit={handleCreate}>
              <div className={styles.formRow}>
                <label className={styles.label}>
                  E-post
                  <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="namn@exempel.se"
                    required
                  />
                </label>
                <label className={styles.label}>
                  Användarnamn
                  <input
                    className={styles.input}
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="t.ex. anna.k"
                    required
                  />
                </label>
                <label className={styles.label}>
                  Lösenord
                  <input
                    className={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minst 8 tecken"
                    required
                  />
                </label>
              </div>

              <div className={styles.formRow} style={{ justifyContent: "flex-end" }}>
                <button className={styles.primaryBtn} type="submit" disabled={creating}>
                  {creating ? "Skapar…" : "Skapa anställd"}
                </button>
              </div>
              {createMsg && (
                <div className={styles.formMsg} role="status">
                  {createMsg}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Höger: lista användare */}
        <div className={styles.card}>
          <SectionTitle icon={<FiUsers className={styles.cardTitleIcon} />}>
            Användare i denna verkstad
          </SectionTitle>

          {loading ? (
            <div className={styles.placeholder}>Laddar användare…</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : users.length === 0 ? (
            <div className={styles.placeholder}>Inga användare än.</div>
          ) : (
            <div className={styles.list}>
              {users.map((u) => (
                <div key={u.id} className={styles.userRow}>
                  <div className={styles.userMain}>
                    <div className={styles.userName}>
                      <strong>{u.username}</strong>
                      <span>• {u.email}</span>
                    </div>
                    <div className={styles.roleBadge}>
                      {u.role === "workshop_user"
                        ? "Ägare"
                        : u.role === "workshop_employee"
                        ? "Anställd"
                        : "Owner"}
                    </div>
                  </div>
                  <div className={styles.userMeta}>
                    {u.workshops?.map((w) => (
                      <span key={w.id} className={styles.wsChip}>
                        {w.name}
                        {w.city ? `, ${w.city}` : ""}
                      </span>
                    ))}
                  </div>
                  <div className={styles.rowActions}>
                    {u.role !== "owner" && (
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => openSchedule(u)}
                        title="Arbetstider & frånvaro"
                      >
                        <FiClock /> <span>Schema</span>
                      </button>
                    )}
                    {u.role !== "workshop_user" && (
                      <button
                        className={styles.dangerBtn}
                        onClick={() => handleDelete(u.id)}
                      >
                        <FiTrash2 />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Modal: Arbetstider / Frånvaro */}
      <Modal
        title={scheduleOpenFor ? `Schema – ${scheduleOpenFor.username}` : ""}
        open={!!scheduleOpenFor}
        onClose={closeSchedule}
        footer={
          <div
            className={styles.modalFooterRow}
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={styles.secondaryBtn} onClick={applyOfficePreset}>
                <FiSettings /> 08–17 mån–fre
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={applyOfficePresetWithLunch}
              >
                <FiCoffee /> 08–17 + lunch {lunchStart}–{lunchEnd}
              </button>
            </div>
            <button className={styles.primaryBtn} onClick={closeSchedule}>
              <FiX /> Stäng
            </button>
          </div>
        }
      >
        {/* Top-meta */}
        {scheduleOpenFor && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "6px 0 12px",
              borderBottom: "1px solid #eee",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 14 }}>
              <strong>{scheduleOpenFor.username}</strong>{" "}
              <InlineHelp>
                {workshopName} {workshopCity ? `• ${workshopCity}` : ""}
              </InlineHelp>
            </div>
            <InlineHelp>Alla tider lagras per användare</InlineHelp>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs} style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <button
            className={`${styles.tabBtn} ${activeTab === "hours" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("hours")}
          >
            <FiClock /> Arbetstider
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "timeoff" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("timeoff")}
          >
            <FiCalendar /> Frånvaro
          </button>
        </div>

        {/* Content */}
        {activeTab === "hours" ? (
          scheduleLoading ? (
            <div className={styles.placeholder}>Laddar arbetstider…</div>
          ) : (
            <>
              {scheduleError && <div className={styles.error}>{scheduleError}</div>}

              {/* Ny rad: arbetstid + ev. lunch */}
              <div
                className={styles.scheduleForm}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                {/* Veckodag snabblista */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.label} style={{ display: "block", marginBottom: 6 }}>
                    Veckodag
                  </label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {WEEKDAY_INDEXES.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setWeekday(i)}
                        className={styles.wsChip}
                        style={{
                          cursor: "pointer",
                          border: i === weekday ? "1px solid #111" : "1px solid #ddd",
                          background: i === weekday ? "#f7f7f7" : "#fff",
                        }}
                        aria-pressed={i === weekday}
                      >
                        {WEEKDAYS[i]}
                      </button>
                    ))}
                  </div>
                </div>

                <label className={styles.labelInline}>
                  Start
                  <input
                    type="time"
                    className={styles.input}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    step={60}
                  />
                </label>

                <label className={styles.labelInline}>
                  Slut
                  <input
                    type="time"
                    className={styles.input}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    step={60}
                  />
                </label>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={withLunch}
                      onChange={(e) => setWithLunch(e.target.checked)}
                    />
                    <span>
                      Inkludera lunchrast{" "}
                      <InlineHelp>(skapar två pass: före + efter lunchen)</InlineHelp>
                    </span>
                  </label>
                </div>

                {withLunch && (
                  <>
                    <label className={styles.labelInline}>
                      Lunch start
                      <input
                        type="time"
                        className={styles.input}
                        value={lunchStart}
                        onChange={(e) => setLunchStart(e.target.value)}
                        step={60}
                      />
                    </label>
                    <label className={styles.labelInline}>
                      Lunch slut
                      <input
                        type="time"
                        className={styles.input}
                        value={lunchEnd}
                        onChange={(e) => setLunchEnd(e.target.value)}
                        step={60}
                      />
                    </label>
                  </>
                )}

                <label className={styles.labelInline}>
                  Gäller från (valfritt)
                  <input
                    type="date"
                    className={styles.input}
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                  />
                </label>
                <label className={styles.labelInline}>
                  Gäller till (valfritt)
                  <input
                    type="date"
                    className={styles.input}
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1", justifyContent: "flex-end" }}>
                  <button className={styles.primaryBtn} onClick={addWorkingHour}>
                    <FiPlus /> Lägg till
                  </button>
                </div>
              </div>

              {/* Lista tider (grupperat per dag) */}
              {workingHours.length === 0 ? (
                <div className={styles.placeholder} style={{ marginTop: 12 }}>
                  Inga arbetstider ännu.
                </div>
              ) : (
                <div className={styles.whList} style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {WEEKDAY_INDEXES.map((dIdx) => {
                    const items = workingHours.filter((w) => w.weekday === dIdx).sort(sortWH);
                    if (items.length === 0) return null;
                    return (
                      <div key={dIdx} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{WEEKDAYS[dIdx]}</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {items.map((w) => (
                            <div key={w.id} className={styles.whRow} style={{ alignItems: "center" }}>
                              <div className={styles.whMain}>
                                <span>
                                  {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}
                                </span>
                                {(w.valid_from || w.valid_to) && (
                                  <span className={styles.muted} style={{ marginLeft: 8 }}>
                                    {w.valid_from ? `från ${w.valid_from}` : ""}
                                    {w.valid_to ? ` till ${w.valid_to}` : ""}
                                  </span>
                                )}
                              </div>
                              <div className={styles.rowActions}>
                                <button
                                  className={styles.dangerBtn}
                                  onClick={() => removeWorkingHour(w.id)}
                                  title="Ta bort"
                                >
                                  <FiTrash2 />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        ) : timeOffLoading ? (
          <div className={styles.placeholder}>Laddar frånvaro…</div>
        ) : (
          <>
            {timeOffError && <div className={styles.error}>{timeOffError}</div>}

            {/* Ny frånvaro */}
            <div
              className={styles.timeoffForm}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                alignItems: "end",
              }}
            >
              <label className={styles.labelInline}>
                Start
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={toStart}
                  onChange={(e) => setToStart(e.target.value)}
                />
              </label>
              <label className={styles.labelInline}>
                Slut
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={toEnd}
                  onChange={(e) => setToEnd(e.target.value)}
                />
              </label>
              <label className={styles.labelInline}>
                Typ
                <select
                  className={styles.select}
                  value={toType}
                  onChange={(e) => setToType(e.target.value as TimeOffType)}
                >
                  <option value="vacation">Semester</option>
                  <option value="sick">Sjuk</option>
                  <option value="training">Utbildning</option>
                  <option value="other">Övrigt</option>
                </select>
              </label>
              <label className={styles.labelInlineWide} style={{ gridColumn: "1 / -1" }}>
                Orsak (valfritt) <InlineHelp>t.ex. VAB, kursnamn…</InlineHelp>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="t.ex. VAB, kursnamn…"
                  value={toReason}
                  onChange={(e) => setToReason(e.target.value)}
                />
              </label>

              <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1", justifyContent: "flex-end" }}>
                <button className={styles.primaryBtn} onClick={addTimeOff}>
                  <FiSave /> Lägg till frånvaro
                </button>
              </div>
            </div>

            {/* Lista frånvaro */}
            {timeOff.length === 0 ? (
              <div className={styles.placeholder} style={{ marginTop: 12 }}>
                Ingen frånvaro registrerad.
              </div>
            ) : (
              <div className={styles.toList} style={{ marginTop: 12 }}>
                {timeOff
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
                  )
                  .map((t) => (
                    <div
                      key={t.id}
                      className={styles.toRow}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "1px solid #eee",
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div className={styles.toMain}>
                        <strong>
                          {new Date(t.start_at).toLocaleString()} –{" "}
                          {new Date(t.end_at).toLocaleString()}
                        </strong>
                        <span className={styles.toType} style={{ marginLeft: 8 }}>
                          {t.type === "vacation"
                            ? "Semester"
                            : t.type === "sick"
                            ? "Sjuk"
                            : t.type === "training"
                            ? "Utbildning"
                            : "Övrigt"}
                        </span>
                        {t.reason && (
                          <span className={styles.muted} style={{ marginLeft: 6 }}>
                            • {t.reason}
                          </span>
                        )}
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.dangerBtn}
                          onClick={() => removeTimeOff(t.id)}
                        >
                          <FiTrash2 /> Ta bort
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/** En enkel fallback om du inte hunnit lägga till FiRefreshCw i styles */
function FiRefreshCwFallback() {
  return <FiSun style={{ transform: "rotate(90deg)" }} />;
}
