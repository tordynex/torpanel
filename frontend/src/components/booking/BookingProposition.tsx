// BookingProposition.tsx
import React, { useMemo, useState, useEffect } from "react";
import type { AvailabilityProposal } from "@/services/bookingsService";
import type { UserSimple } from "@/services/workshopService";
import styles from "./css/SimpleBookingForm.module.css";

type Props = {
  proposals: AvailabilityProposal[];
  employees: UserSimple[];
  selectedIndex: number | null;
  setSelectedIndex: (i: number) => void;
  fmt: (iso: string) => string;
};

type GroupKey = string;

type Group = {
  key: GroupKey;
  start_at: string;
  end_at: string;
  bay_id: number;
  bay_label: string;
  // alla proposal-index (mot original-array) som ingår i gruppen
  proposalIndices: number[];
  // lista av (user_id) som är valbara mekar för just denna tid/bay
  mechanicIds: number[];
  // mappning: mechId -> proposalIndex i original-array
  mechToProposalIndex: Record<number, number>;
};

const BookingProposition: React.FC<Props> = ({
  proposals,
  employees,
  selectedIndex,
  setSelectedIndex,
  fmt,
}) => {
  const usernameById = (id?: number | null) => {
    if (!id) return null;
    const u = employees.find((e) => e.id === id);
    return u?.username ?? `User #${id}`;
  };

  // Bygg grupper: key = start|end|bay_id
  const groups: Group[] = useMemo(() => {
    const map = new Map<GroupKey, Group>();

    proposals.forEach((p, idx) => {
      const key = `${p.start_at}|${p.end_at}|${p.bay_id}`;
      const bayLabel = p.notes ?? `Bay #${p.bay_id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          start_at: p.start_at,
          end_at: p.end_at,
          bay_id: p.bay_id,
          bay_label: bayLabel,
          proposalIndices: [],
          mechanicIds: [],
          mechToProposalIndex: {},
        });
      }
      const g = map.get(key)!;
      g.proposalIndices.push(idx);

      // Förväntat: backend skickar en proposal per mek (assigned_user_id satt).
      // Men om assigned_user_id saknas, fall tillbaka på meta.candidates.
      const assigned = p.assigned_user_id ?? p.meta?.recommended_user_id ?? null;

      if (assigned != null) {
        if (!g.mechToProposalIndex[assigned]) {
          g.mechToProposalIndex[assigned] = idx;
        }
        if (!g.mechanicIds.includes(assigned)) {
          g.mechanicIds.push(assigned);
        }
      } else if (p.meta?.candidates?.length) {
        for (const c of p.meta.candidates) {
          if (!g.mechToProposalIndex[c.user_id]) {
            // försök hitta exakt matchande proposal för denna mekaniker
            // om vi inte hittar, låt mappa till den här idx som fallback
            const matchIdx = proposals.findIndex(
              (pp, ii) =>
                ii !== idx &&
                pp.bay_id === p.bay_id &&
                pp.start_at === p.start_at &&
                pp.end_at === p.end_at &&
                pp.assigned_user_id === c.user_id
            );
            g.mechToProposalIndex[c.user_id] =
              matchIdx >= 0 ? matchIdx : idx;
          }
          if (!g.mechanicIds.includes(c.user_id)) {
            g.mechanicIds.push(c.user_id);
          }
        }
      }
    });

    // sortera grupper i tidsordning, sen bay
    const list = Array.from(map.values()).sort((a, b) => {
      if (a.start_at !== b.start_at) return a.start_at < b.start_at ? -1 : 1;
      if (a.end_at !== b.end_at) return a.end_at < b.end_at ? -1 : 1;
      return a.bay_id - b.bay_id;
    });

    // sortera mekaniker i varje grupp efter namn (stabilt fallback på id)
    for (const g of list) {
      g.mechanicIds.sort((x, y) => {
        const ax = usernameById(x) ?? `User #${x}`;
        const ay = usernameById(y) ?? `User #${y}`;
        if (ax === ay) return x - y;
        return ax.localeCompare(ay, "sv");
      });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, employees]);

  // Håll lokalt vilken mekaniker som är vald per grupp-key
  const [selectedMechByGroup, setSelectedMechByGroup] = useState<Record<GroupKey, number | null>>({});

  // Synka initialt val (om selectedIndex pekar på en proposal i en viss grupp)
  useEffect(() => {
    if (selectedIndex == null || !proposals[selectedIndex]) return;
    const p = proposals[selectedIndex];
    const key = `${p.start_at}|${p.end_at}|${p.bay_id}`;
    const mech = p.assigned_user_id ?? p.meta?.recommended_user_id ?? null;
    if (mech != null) {
      setSelectedMechByGroup((prev) =>
        prev[key] === mech ? prev : { ...prev, [key]: mech }
      );
    }
  }, [selectedIndex, proposals]);

  // Om ingen selection finns för en grupp – välj första mekanikern i listan
  useEffect(() => {
    setSelectedMechByGroup((prev) => {
      const copy = { ...prev };
      let changed = false;
      for (const g of groups) {
        if (copy[g.key] == null) {
          const first = g.mechanicIds[0] ?? null;
          copy[g.key] = first ?? null;
          changed = true;
        }
      }
      return changed ? copy : prev;
    });
  }, [groups]);

  const onPickGroup = (g: Group) => {
    // när man klickar på raden/radion: välj aktuell mech i gruppen (eller första)
    const mech = selectedMechByGroup[g.key] ?? g.mechanicIds[0] ?? null;
    if (mech != null) {
      const idx = g.mechToProposalIndex[mech];
      if (typeof idx === "number") {
        setSelectedIndex(idx);
      }
    } else {
      // om ingen mech i gruppen – välj första proposalIndex
      if (g.proposalIndices.length > 0) {
        setSelectedIndex(g.proposalIndices[0]);
      }
    }
  };

  const onChangeMechanic = (g: Group, mechIdStr: string) => {
    const mechId = parseInt(mechIdStr, 10);
    setSelectedMechByGroup((prev) => ({ ...prev, [g.key]: mechId }));
    const idx = g.mechToProposalIndex[mechId];
    if (typeof idx === "number") {
      setSelectedIndex(idx);
    }
  };

  const isGroupSelected = (g: Group) => {
    if (selectedIndex == null) return false;
    return g.proposalIndices.includes(selectedIndex);
  };

  return (
    <div role="radiogroup" aria-label="Välj förslag">
      <table className={styles.table}>
        <thead>
          <tr>
            <th></th>
            <th>Start</th>
            <th>Slut</th>
            <th>Bay</th>
            <th>Mekaniker</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => {
            const selected = isGroupSelected(g);
            const mechSelected = selectedMechByGroup[g.key] ?? null;
            const mechLabel =
              usernameById(mechSelected ?? undefined) ??
              (mechSelected != null ? `User #${mechSelected}` : "Ej satt");

            return (
              <tr
                key={`${g.key}-${i}`}
                className={selected ? styles.rowActive : undefined}
                onClick={() => onPickGroup(g)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <input
                    type="radio"
                    name="proposal"
                    checked={selected}
                    onChange={() => onPickGroup(g)}
                    aria-label={`Välj förslag ${i + 1}`}
                  />
                </td>
                <td>{fmt(g.start_at)}</td>
                <td>{fmt(g.end_at)}</td>
                <td>{g.bay_label}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {g.mechanicIds.length > 0 ? (
                    <select
                      value={mechSelected ?? ""}
                      onChange={(e) => onChangeMechanic(g, e.target.value)}
                      aria-label="Välj mekaniker"
                    >
                      {g.mechanicIds.map((uid) => (
                        <option key={uid} value={uid}>
                          {usernameById(uid) ?? `User #${uid}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>Ej satt</span>
                  )}
                </td>
              </tr>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", opacity: 0.75 }}>
                Inga förslag i valt intervall.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default BookingProposition;
