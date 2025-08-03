export function useAuth() {
  const token = localStorage.getItem("token")
  if (!token) return null

  const payload = JSON.parse(atob(token.split(".")[1]))
  return {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    token,
  }
}
