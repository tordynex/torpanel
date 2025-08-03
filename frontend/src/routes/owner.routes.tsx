import { type RouteObject } from "react-router"
import OwnerLayout from "../components/owner/OwnerLayout"
import Dashboard from "../pages/Owner/Dashboard"
import Users from "../pages/Owner/Users"
import Workshops from "../pages/Owner/Workshops"
import Cars from "../pages/Owner/Cars"
import ServiceLogs from "../pages/Owner/ServiceLogs"

export const ownerRoutes: RouteObject = {
  path: "/owner",
  element: <OwnerLayout />,
  children: [
    { path: "", element: <Dashboard /> },
    { path: "users", element: <Users /> },
    { path: "workshops", element: <Workshops /> },
    { path: "cars", element: <Cars /> },
    { path: "servicelogs", element: <ServiceLogs /> },
  ],
}
