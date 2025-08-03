import { type RouteObject } from "react-router"
import OwnerLayout from "../components/owner/OwnerLayout"
import Dashboard from "../pages/owner/Dashboard"
import Users from "../pages/owner/Users"
import Workshops from "../pages/owner/Workshops"
import Cars from "../pages/owner/Cars"
import ServiceLogs from "../pages/owner/ServiceLogs"

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
