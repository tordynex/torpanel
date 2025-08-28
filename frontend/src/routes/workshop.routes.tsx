import { type RouteObject } from "react-router"
import WorkshopLayout from "../components/workshop/WorkshopLayout"
import Dashboard from "../pages/workshop/Dashboard"
import WorkshopUsersPage from "../pages/workshop/Users"
import ServiceLog from "../pages/workshop/ServiceLog"
import CarDatabase from "../pages/workshop/CarDatabase"
import ServiceBay from "../pages/workshop/ServiceBay"
import Calendar from "../pages/workshop/Calendar"
import ServiceItemPage from "../pages/workshop/ServiceItem"

export const workshopRoutes: RouteObject = {
  path: "/workshop",
  element: <WorkshopLayout />,
  children: [
    { path: "", element: <Dashboard /> },
    { path: "users", element: <WorkshopUsersPage /> },
    { path: "servicelog", element: <ServiceLog /> },
    { path: "car-database", element: <CarDatabase /> },
    { path: "servicebays", element: <ServiceBay /> },
    { path: "calendar", element: <Calendar /> },
    { path: "service-item", element: <ServiceItemPage /> },
  ],
}
