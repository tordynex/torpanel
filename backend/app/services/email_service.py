import os
from email.message import EmailMessage
from aiosmtplib import send
from jinja2 import Template

# EN gemensam HTML-template för alla e-mails
BASE_EMAIL_TEMPLATE = """
<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; background-color: #f8f8f8; padding: 20px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px;">
      <img src="https://www.portal.autonexo.se/autonexo_logo_black.png" alt="Autonexo" style="width: 180px; margin-bottom: 30px;" />
      <h2>{{ heading }}</h2>
      <p>{{ message }}</p>
      {% if button_link and button_text %}
      <p style="text-align: center; margin-top: 20px; margin-bottom: 20px;">
        <a href="{{ button_link }}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">
          {{ button_text }}
        </a>
      </p>
      {% endif %}
      <p style="font-size: 14px; color: #555;">Tveka inte att kontakta oss vid frågor.</p>
    </div>
  </body>
</html>
"""

async def send_email(
    to_email: str,
    subject: str,
    heading: str,
    message: str,
    button_link: str = None,
    button_text: str = None,
):
    # Text fallback för e-postklienter utan HTML
    text_body = f"{heading}\n\n{message}\n\n{button_text or ''}: {button_link or ''}"

    # Rendera HTML
    html_template = Template(BASE_EMAIL_TEMPLATE)
    html_body = html_template.render(
        heading=heading,
        message=message,
        button_link=button_link,
        button_text=button_text
    )

    msg = EmailMessage()
    msg["From"] = os.getenv("SMTP_FROM")
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    await send(
        msg,
        hostname=os.getenv("SMTP_HOST"),
        port=int(os.getenv("SMTP_PORT")),
        username=os.getenv("SMTP_USER"),
        password=os.getenv("SMTP_PASS"),
        start_tls=True
    )

# Specialfunktioner med innehåll
async def send_password_reset_email(to_email: str, name: str, reset_link: str):
    """
    Skickar ett lösenordsåterställningsmail till användaren.
    Kräver att send_email() och BASE_EMAIL_TEMPLATE finns definierade i samma modul.
    """
    await send_email(
        to_email=to_email,
        subject="Återställ ditt lösenord",
        heading=f"Hej {name}!",
        message="Vi har fått en begäran om att återställa ditt lösenord. Klicka på knappen nedan för att fortsätta.",
        button_link=reset_link,
        button_text="Återställ lösenord"
    )

async def send_welcome_email(to_email: str, name: str):
    await send_email(
        to_email=to_email,
        subject="Välkommen till Autonexo!",
        heading=f"Välkommen {name}!",
        message="Ditt konto har skapats och du är nu redo att logga in och börja använda Autonexo.",
        button_link="https://www.portal.autonexo.se",
        button_text="Logga in"
    )
