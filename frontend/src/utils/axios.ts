import axios from "axios"

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  withCredentials: true, // 👈 skicka cookies
})

instance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      // städa ev. client-state (inte token)
      localStorage.removeItem("currentUser")
      localStorage.removeItem("currentWorkshop")
      if (window.location.pathname !== "/login") {
        window.location.href = "/login"
      }
    }
    return Promise.reject(err)
  }
)

export default instance
