
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import upsellService from "@/services/upsellService";

export default function UpsellLanding() {
  const { token, action } = useParams(); // action = "approve" | "decline"
  const [state, setState] = useState<"loading"|"done"|"error">("loading");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!token || !action) { setState("error"); return; }
      try {
        let res;
        if (action === "approve") res = await upsellService.approveUpsell(token);
        else if (action === "decline") res = await upsellService.declineUpsell(token);
        else { setState("error"); return; }

        setStatus(res.status); // "accepted" | "declined" | "expired" | "pending_customer" | ...
        setState("done");
      } catch {
        setState("error");
      }
    })();
  }, [token, action]);

  if (state === "loading") return <Page><h2>Bearbetar…</h2><p>Var god vänta.</p></Page>;
  if (state === "error")   return <Page><h2>Något gick fel</h2><p>Länken kan vara ogiltig eller redan använd.</p></Page>;

  // Visa trevligt besked baserat på status
  const msg =
    status === "accepted" ? "Tack! Ditt erbjudande har godkänts ✅"
  : status === "declined" ? "Du har avböjt erbjudandet ❌"
  : status === "expired"  ? "Erbjudandet har tyvärr gått ut ⏰"
  : status === "pending_customer" ? "Vi väntar fortfarande på svar…"
  : status === "cancelled" ? "Erbjudandet är avbrutet"
  : status === "draft" ? "Erbjudandet är inte skickat ännu"
  : "Status uppdaterad.";

  return (
    <Page>
      <h2>{msg}</h2>
      <p>Du kan stänga den här sidan.</p>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: 560, margin: "48px auto", padding: 24,
      borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.08)",
      fontFamily: "system-ui, Segoe UI, Roboto, sans-serif"
    }}>
      {children}
      <footer style={{ marginTop: 24, opacity: .6, fontSize: 14 }}>
        Drivs av {import.meta.env.VITE_APP_NAME ?? "verkstaden"}
      </footer>
    </div>
  );
}
