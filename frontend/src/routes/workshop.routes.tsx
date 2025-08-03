import { type RouteObject } from "react-router"
import WorkshopLayout from "../components/workshop/WorkshopLayout"
import Dashboard from "../pages/workshop/Dashboard"
import Users from "../pages/workshop/Users"
import ServiceLog from "../pages/workshop/ServiceLog"
import CarDatabase from "../pages/workshop/CarDatabase"

export const workshopRoutes: RouteObject = {
  path: "/workshop",
  element: <WorkshopLayout />,
  children: [
    { path: "", element: <Dashboard /> },
    { path: "users", element: <Users /> },
    { path: "servicelog", element: <ServiceLog /> },
    { path: "car-database", element: <CarDatabase /> },
  ],
}
