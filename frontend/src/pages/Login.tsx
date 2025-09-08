import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import LoginBox from "@/components/login/LoginBox"
import userService from "@/services/userService"

export default function LoginPage() {
  const navigate = useNavigate()
  const ranRef = useRef(false)

  const goByRole = (user: any) => {
    localStorage.setItem("currentUser", JSON.stringify(user))
    const workshop = user.workshops?.[0]
    if (workshop) localStorage.setItem("currentWorkshop", JSON.stringify(workshop))

    if (user.role === "owner") {
      navigate("/owner/", { replace: true })
    } else if (["workshop_user", "workshop_employee"].includes(user.role || "")) {
      navigate("/workshop", { replace: true })
    } else {
      // okänd roll – stanna på login utan loop
    }
  }

  const clearAuth = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("currentUser")
    localStorage.removeItem("currentWorkshop")
  }

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    // 🔑 Ny princip: oavsett om vi har token eller cookie – verifiera med servern.
    // INGEN redirect baserat på att JWT har giltig exp lokalt.
    const verify = async () => {
      try {
        const user = await userService.fetchCurrentUser() // verifierar token/cookie mot backend
        goByRole(user)
      } catch {
        // inte inloggad – stanna på login och se till att lokal auth är bortstädad
        clearAuth()
      }
    }

    verify()
  }, [navigate])

  return (
    <LoginBox
      onSuccess={async (token) => {
        // Om vi får en token – spara den och verifiera DIREKT mot servern
        if (token) localStorage.setItem("token", token)

        try {
          const user = await userService.fetchCurrentUser()
          goByRole(user)
        } catch {
          // misslyckad verifiering → rensa och stanna
          clearAuth()
        }
      }}
    />
  )
}
