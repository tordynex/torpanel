import { useRoutes, Navigate } from "react-router-dom";
import { ownerRoutes } from "./routes/owner.routes";
import { workshopRoutes } from "./routes/workshop.routes";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/Reset-Password";

export default function App() {
  const routes = useRoutes([
    { path: "/", element: <Navigate to="/login" replace /> },
    { path: "/login", element: <LoginPage /> },
    { path: "/reset-password", element: <ResetPasswordPage /> },

    // Grupp-importerade route-träd
    ownerRoutes,
    workshopRoutes,

    // 404 fallback
    { path: "*", element: <Navigate to="/login" replace /> },
  ]);

  return routes;
}
