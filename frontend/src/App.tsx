import { useRoutes, Navigate } from "react-router-dom";
import { ownerRoutes } from "./routes/owner.routes";
import { workshopRoutes } from "./routes/workshop.routes";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/Reset-Password";
import RegistreringsnummerPage from "./pages/booking/Registreringsnummer.tsx"
import HittaVerkstadPage from "./pages/booking/Hitta-Verkstad.tsx"
import ValjTjanstPage from "@/pages/booking/Valj-Tjanst.tsx";
import SammanfattningPage from "@/pages/booking/Sammanfattning.tsx";
import BookingComplete from "@/components/booking/BookingComplete.tsx";

export default function App() {
  const routes = useRoutes([
    { path: "/", element: <Navigate to="/login" replace /> },
    { path: "/login", element: <LoginPage /> },
    { path: "/reset-password", element: <ResetPasswordPage /> },
    { path: "/boka", element: <RegistreringsnummerPage /> },
    { path: "/boka/hitta-verkstad", element: <HittaVerkstadPage /> },
    { path: "/boka/valj-tjanst", element: <ValjTjanstPage /> },
    { path: "/boka/sammanfattning", element: <SammanfattningPage /> },
    { path: "/boka/tack", element: <BookingComplete /> },

    // Grupp-importerade route-träd
    ownerRoutes,
    workshopRoutes,

    // 404 fallback
    { path: "*", element: <Navigate to="/login" replace /> },
  ]);

  return routes;
}
