import React, { useEffect, useState, useRef } from "react"
import serviceLogService from "@/services/servicelogService"
import type { ServiceLog, ServiceLogUpdate } from "@/services/servicelogService"
import dayjs from "dayjs"
import "./ServiceLogs.css"

const ServiceLogs: React.FC = () => {
  const [logs, setLogs] = useState<ServiceLog[]>([])
  const [filterDate, setFilterDate] = useState<string>("")
  const [searchReg, setSearchReg] = useState<string>("")
  const [editingLog, setEditingLog] = useState<ServiceLog | null>(null)
  const [formState, setFormState] = useState<ServiceLogUpdate>({})
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null)
  const editFormRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    const data = await serviceLogService.fetchAllLogs()
    setLogs(data)
  }

  const handleEdit = (log: ServiceLog) => {
    setEditingLog(log)
    setFormState({
      work_performed: log.work_performed,
      date: log.date,
      mileage: log.mileage,
      workshop_id: log.workshop_id,
      tasks: log.tasks.map(({ title, comment }) => ({ title, comment })),
    })
        setTimeout(() => {
      editFormRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleUpdate = async () => {
    if (!editingLog) return
    await serviceLogService.updateLog(editingLog.id, formState)
    setEditingLog(null)
    setFormState({})
    fetchLogs()
  }

  const handleDelete = async () => {
    if (deletingLogId !== null) {
      await serviceLogService.deleteLog(deletingLogId)
      setDeletingLogId(null)
      fetchLogs()
    }
  }

  const filteredLogs = logs.filter((log) => {
    const matchesDate = filterDate ? dayjs(log.date).isSame(filterDate, "day") : true
    const matchesReg = searchReg
      ? log.car?.registration_number.toLowerCase().includes(searchReg.toLowerCase())
      : true
    return matchesDate && matchesReg
  })

  return (
    <div className="formWrapper">
      <h2>Service Logs</h2>

      <label>
        Filtrera efter datum:
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
      </label>

      <label>
        Sök registreringsnummer:
        <input
          type="text"
          placeholder="Ex: ABC123"
          value={searchReg}
          onChange={(e) => setSearchReg(e.target.value)}
        />
      </label>

      {filteredLogs.map((log) => (
        <div key={log.id} className="logCard">
          <p><strong>Bil:</strong> {log.car?.registration_number}, {log.car?.brand} - {log.car?.model_year}</p>
          <p><strong>Datum:</strong> {log.date}</p>
          <p><strong>Miltal:</strong> {log.mileage} km</p>
          <p><strong>Utfört arbete:</strong> {log.work_performed}</p>

          <div className="taskList">
            {log.tasks.map((task) => (
              <div key={task.id} className="taskItem">
                <p><strong>{task.title}:</strong> {task.comment}</p>
              </div>
            ))}
          </div>

          <div className="buttons">
            <button className="saveBtn" onClick={() => handleEdit(log)}>Redigera</button>
            <button className="deleteInitBtn" onClick={() => setDeletingLogId(log.id)}>Ta bort</button>
          </div>

          {deletingLogId === log.id && (
            <div className="deleteSection">
              <p className="confirmText">Bekräfta att du vill ta bort loggen.</p>
              <div className="buttons">
                <button className="deleteBtn" onClick={handleDelete}>Ta bort</button>
                <button className="cancelBtn" onClick={() => setDeletingLogId(null)}>Avbryt</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {editingLog && (
        <div className="form" ref={editFormRef}>
          <h3>Redigera Logg</h3>
          <label>
            Utfört arbete:
            <input
              value={formState.work_performed || ""}
              onChange={(e) => setFormState({ ...formState, work_performed: e.target.value })}
            />
          </label>
          <label>
            Datum:
            <input
              type="date"
              value={formState.date || ""}
              onChange={(e) => setFormState({ ...formState, date: e.target.value })}
            />
          </label>
          <label>
            Miltal:
            <input
              type="number"
              value={formState.mileage || 0}
              onChange={(e) => setFormState({ ...formState, mileage: parseInt(e.target.value) })}
            />
          </label>

          <div className="taskList">
            <h4>Servicepunkter</h4>
            {formState.tasks?.map((task, index) => (
              <div key={index} className="taskItem">
                <label>
                  Titel:
                  <input
                    value={task.title}
                    onChange={(e) => {
                      const updatedTasks = [...formState.tasks!]
                      updatedTasks[index].title = e.target.value
                      setFormState({ ...formState, tasks: updatedTasks })
                    }}
                  />
                </label>
                <label>
                  Kommentar:
                  <input
                    value={task.comment}
                    onChange={(e) => {
                      const updatedTasks = [...formState.tasks!]
                      updatedTasks[index].comment = e.target.value
                      setFormState({ ...formState, tasks: updatedTasks })
                    }}
                  />
                </label>
              </div>
            ))}

            <button
              className="saveBtn"
              type="button"
              onClick={() =>
                setFormState({
                  ...formState,
                  tasks: [...(formState.tasks || []), { title: "", comment: "" }],
                })
              }
            >
              Lägg till ny task
            </button>
          </div>

          <div className="buttons">
            <button className="saveBtn" onClick={handleUpdate}>Spara ändringar</button>
            <button className="cancelBtn" onClick={() => setEditingLog(null)}>Avbryt</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServiceLogs