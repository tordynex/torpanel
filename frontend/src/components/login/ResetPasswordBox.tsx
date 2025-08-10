import { useEffect, useState } from "react"
import { useSearchParams, Link, useNavigate } from "react-router-dom"
import { FaKey } from "react-icons/fa"
import styles from "./LoginBox.module.css"
import userService from "@/services/userService"

export default function ResetPasswordBox() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()

  const token = sp.get("token") || ""
  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!token) setError("Ogiltig länk: token saknas.")
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!token) return setError("Ogiltig länk: token saknas.")
    if (p1.length < 8) return setError("Lösenordet måste vara minst 8 tecken.")
    if (p1 !== p2) return setError("Lösenorden matchar inte.")

    setLoading(true)
    try {
      await userService.resetPassword(token, p1)
      setInfo("Klart! Ditt lösenord har uppdaterats. Du kan nu logga in.")
      setTimeout(() => navigate("/login"), 1800)
    } catch (err: any) {
      console.error(err)
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Ogiltig eller utgången länk."
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.header}>
        <img
          src="/autonexo_logo_black.png"
          alt="Autonexo logo"
          className={styles.toplogo}
        />
      </h2>

      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 style={{ marginTop: 0 }}>Återställ lösenord</h3>

        <label>
          Nytt lösenord
          <input
            type="password"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            placeholder="Minst 8 tecken"
            required
            autoComplete="new-password"
          />
        </label>

        <label>
          Bekräfta nytt lösenord
          <input
            type="password"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}
        {info && <p className={styles.info}>{info}</p>}

        <button type="submit" className={styles.loginBtn} disabled={loading || !token}>
          {loading ? "Uppdaterar..." : (<><FaKey /> Uppdatera lösenord</>)}
        </button>

        <div className={styles.metaRow}>
          <Link to="/login" className={styles.linkBtn}>
            ← Tillbaka till inloggning
          </Link>
        </div>
      </form>
    </div>
  )
}
