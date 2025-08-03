import { useNavigate } from "react-router-dom"
import LoginBox from "@/components/login/LoginBox"
import userService from "@/services/userService"

export default function LoginPage() {
  const navigate = useNavigate()

   if (localStorage.getItem("token")) {
  const payload = JSON.parse(atob(localStorage.getItem("token")!.split(".")[1]))
  if (payload.role === "owner") {
    navigate("/owner/")
  }
}

  return (
    <LoginBox
      onSuccess={(token) => {
          console.log("Inloggad med token:", token)

          // Spara token
          localStorage.setItem("token", token)

          // Läs ut payload från JWT (kan användas om du vill snabbt kolla roll/id)
          const payload = JSON.parse(atob(token.split(".")[1]))

          if (payload.role === "owner") {
            navigate("/owner/")
          } else if (payload.role === "workshop_user") {
            userService.fetchCurrentUser()
              .then((user) => {
                const workshop = user.workshops?.[0]

                localStorage.setItem("currentUser", JSON.stringify(user))

                if (workshop) {
                  localStorage.setItem("currentWorkshop", JSON.stringify(workshop))
                }

                navigate("/workshop")
              })
              .catch((err) => {
                console.error("Kunde inte hämta användare:", err)
                navigate("/workshop")
              })
          }
        }}
    />
  )
}
