import { useState } from "react"
import { FaSignInAlt } from "react-icons/fa"
import styles from "./LoginBox.module.css"
import userService from "@/services/userService"

export default function LoginBox({
  onSuccess,
}: {
  onSuccess: (token: string) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const res = await userService.login(email, password)
      localStorage.setItem("token", res.access_token)
      onSuccess(res.access_token)
    } catch (err) {
      console.error("Login failed", err)
      setError("Fel e-post eller lösenord")
    }
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.header}>
        <img src="/autonexo_logo_black.png" alt="Autonexo logo" className={styles.toplogo} />
      </h2>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          E-post
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Lösenord
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.loginBtn}>
           Logga in
        </button>
      </form>
    </div>
  )
}
