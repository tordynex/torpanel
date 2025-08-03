import axios from "axios"

const instance = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
})

function isTokenExpired(): boolean {
  const token = localStorage.getItem("token")
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    const now = Date.now() / 1000
    return payload.exp < now
  } catch (e) {
    return true
  }
}

instance.interceptors.request.use(
  (config) => {
    if (isTokenExpired()) {
      localStorage.removeItem("token")
      window.location.href = "/login"
      return Promise.reject("Token expired")
    }

    const token = localStorage.getItem("token")
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

export default instance
