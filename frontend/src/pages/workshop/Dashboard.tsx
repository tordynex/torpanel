import { useWorkshop } from "@/hooks/useWorkshops"

export default function Dashboard() {
    const workshop = useWorkshop()
    const user = JSON.parse(localStorage.getItem("currentUser") || "{}")

    return (
        <>
            <h2>Goddag {user.username}!</h2>
            {workshop ? (
                <p>
                    {workshop.name} i {workshop.city}
                </p>
            ) : (
                <p>Laddar verkstadsinformation...</p>
            )}
        </>
    )
}