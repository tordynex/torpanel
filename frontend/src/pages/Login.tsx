// src/pages/Login.tsx
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import LoginBox from "@/components/login/LoginBox"
import userService from "@/services/userService"

type AuthState = "idle" | "checking" | "guest" | "authed"

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const ranRef = useRef(false)           // se till att verify körs exakt en gång
  const navLockRef = useRef(false)       // förhindra ping-pong med dubbelnavigering
  const [authState, setAuthState] = useState<AuthState>("idle")

  const clearAuth = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("currentUser")
    localStorage.removeItem("currentWorkshop")
  }

  const targetByRole = (user: any) => {
    const role = user?.role || ""
    if (role === "owner") return "/owner/"
    if (["workshop_user", "workshop_employee"].includes(role)) return "/workshop"
    return null
  }

  const goByRole = (user: any) => {
    // skriv till storage en gång
    localStorage.setItem("currentUser", JSON.stringify(user))
    const workshop = user?.workshops?.[0]
    if (workshop) localStorage.setItem("currentWorkshop", JSON.stringify(workshop))

    const target = targetByRole(user)
    if (!target) return // okänd roll -> stanna på login

    // undvik ping-pong: navigera bara om vi inte redan är där
    if (location.pathname !== target && !navLockRef.current) {
      navLockRef.current = true
      navigate(target, { replace: true })
    }
  }

  // Verifiera sessionen EN gång vid mount, men navigera bara om giltig.
  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    ;(async () => {
      setAuthState("checking")
      try {
        const user = await userService.fetchCurrentUser()
        setAuthState("authed")
        goByRole(user)
      } catch {
        clearAuth()
        setAuthState("guest")
        // Viktigt: INGEN navigate till /login här – vi ÄR redan på login.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <LoginBox
      // Efter lyckad inloggning: spara token, verifiera DIREKT mot servern,
      // navigera EN gång, låt route guards vara passiva.
      onSuccess={async (token) => {
        if (token) localStorage.setItem("token", token)

        try {
          const user = await userService.fetchCurrentUser()
          setAuthState("authed")
          goByRole(user)
        } catch {
          clearAuth()
          setAuthState("guest")
        } finally {
          // släpp ev. navigeringslås så framtida logins kan navigera igen
          // (för säkerhets skull, liten delay så replace hinner bli klar)
          setTimeout(() => (navLockRef.current = false), 50)
        }
      }}
      // (valfritt) skicka in laddningsstatus ifall LoginBox vill visa spinner
      loading={authState === "checking"}
    />
  )
}
