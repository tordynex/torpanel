import { useRoutes } from "react-router-dom"
import { ownerRoutes } from "./routes/owner.routes"
import { workshopRoutes } from "./routes/workshop.routes"
import LoginPage from "./pages/Login" // <- Importera sidan

export default function App() {

  const routes = useRoutes([
    {
      path: "/",
      element: <LoginPage />,
    },
    {
      path: "/login",
      element: <LoginPage />,
    },
    ownerRoutes,
    workshopRoutes,
  ])

  return routes
}