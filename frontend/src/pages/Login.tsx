import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import LoginBox from "@/components/login/LoginBox"
import userService from "@/services/userService"

function isTokenValid(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    const now = Math.floor(Date.now() / 1000)
    return typeof payload.exp === "number" && payload.exp > now
  } catch {
    return false
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const ranRef = useRef(false) // 👈 stoppa dubbla körningar i StrictMode

  const handleWorkshopRedirect = async () => {
    try {
      const user = await userService.fetchCurrentUser() // 👈 1 (1) anrop till /me
      const workshop = user.workshops?.[0]
      localStorage.setItem("currentUser", JSON.stringify(user))
      if (workshop) {
        localStorage.setItem("currentWorkshop", JSON.stringify(workshop))
      }
      navigate("/workshop", { replace: true })
    } catch (err) {
      console.error("Kunde inte hämta användare:", err)
      // 👇 Viktigt: rensa ogiltig token och STANNA på login
      localStorage.removeItem("token")
      localStorage.removeItem("currentUser")
      localStorage.removeItem("currentWorkshop")
      // Ingen navigate() här—annars blir det pingpong till /workshop -> /login -> ...
    }
  }

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const token = localStorage.getItem("token")
    if (token && isTokenValid(token)) {
      // 🔒 Behåll befintlig token-baserad redirect
      let role: string | undefined
      try {
        const payload = JSON.parse(atob(token.split(".")[1]))
        role = payload?.role
      } catch {
        localStorage.removeItem("token")
        return
      }

      if (role === "owner") {
        navigate("/owner/", { replace: true })
      } else if (["workshop_user", "workshop_employee"].includes(role || "")) {
        handleWorkshopRedirect()
      }
      return
    }

    // Ingen/ogiltig token? 👉 Prova cookie-session via /me (ändrar inte befintlig funktionalitet,
    // bara ett säkert fallback om backend sätter HttpOnly-cookie).
    localStorage.removeItem("token")
    userService
      .fetchCurrentUser()
      .then(async (user) => {
        // Navigera utifrån användarens role om sessionen redan är giltig i cookie
        if (user.role === "owner") {
          navigate("/owner/", { replace: true })
        } else if (["workshop_user", "workshop_employee"].includes(user.role || "")) {
          await handleWorkshopRedirect()
        }
      })
      .catch(() => {
        // inte inloggad – stanna på login
        localStorage.removeItem("currentUser")
        localStorage.removeItem("currentWorkshop")
      })
  }, [navigate])

  return (
    <LoginBox
      onSuccess={async (token) => {
        // 🔒 Behåll befintlig token-hantering
        if (token) {
          localStorage.setItem("token", token)

          // Validera innan vi rör oss vidare
          if (!isTokenValid(token)) {
            localStorage.removeItem("token")
            return
          }

          let role: string | undefined
          try {
            const payload = JSON.parse(atob(token.split(".")[1]))
            role = payload?.role
          } catch {
            localStorage.removeItem("token")
            return
          }

          if (role === "owner") {
            navigate("/owner/", { replace: true })
          } else if (["workshop_user", "workshop_employee"].includes(role || "")) {
            await handleWorkshopRedirect()
          }
          return
        }

        // Om LoginBox inte skickar token (t.ex. ren cookie-login), prova /me
        try {
          const user = await userService.fetchCurrentUser()
          if (user.role === "owner") {
            navigate("/owner/", { replace: true })
          } else if (["workshop_user", "workshop_employee"].includes(user.role || "")) {
            await handleWorkshopRedirect()
          }
        } catch {
          // stanna på login
        }
      }}
    />
  )
}
