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
  const [info, setInfo] = useState("")
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")
    setLoading(true)
    try {
      const res = await userService.login(email, password)
      localStorage.setItem("token", res.access_token)
      onSuccess(res.access_token)
    } catch (err) {
      console.error("Login failed", err)
      setError("Fel e-post eller lösenord")
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")
    setLoading(true)
    try {
      await userService.requestPasswordReset(email)
      // Svara alltid generiskt av säkerhetsskäl
      setInfo("Om kontot finns har vi skickat ett mail med instruktioner.")
    } catch (err) {
      console.error("Reset request failed", err)
      // Ge fortfarande generiskt svar
      setInfo("Om kontot finns har vi skickat ett mail med instruktioner.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.header}>
        <img src="/autonexo_logo_black.png" alt="Autonexo logo" className={styles.toplogo} />
      </h2>

      {mode === "login" ? (
        <form className={styles.form} onSubmit={handleLogin}>
          <label>
            E-post
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Lösenord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}
          {info && <p className={styles.info}>{info}</p>}

          <button type="submit" className={styles.loginBtn} disabled={loading}>
            {loading ? "Loggar in..." : <> <FaSignInAlt /> Logga in </>}
          </button>

          <div className={styles.metaRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}
            >
              Glömt lösenord?
            </button>
          </div>
        </form>
      ) : (
        <form className={styles.form} onSubmit={handleForgot}>
          <h3>Återställ lösenord</h3>
          <label>
            Ange din e-post
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}
          {info && <p className={styles.info}>{info}</p>}

          <button type="submit" className={styles.loginBtn} disabled={loading}>
            {loading ? "Skickar..." : "Skicka återställningslänk"}
          </button>

          <div className={styles.metaRow}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setMode("login"); setError(""); setInfo(""); }}
            >
              ← Tillbaka till inloggning
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
