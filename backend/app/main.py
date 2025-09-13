from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import users, cars, customers, workshops, servicelogs, servicebay, baybooking, workshopserviceitem, booking, crm, twilio_webhooks, bookingrequests, upsell

app = FastAPI(title="Autonexo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://portal.autonexo.se",
        "https://www.portal.autonexo.se",
        "https://www.autonexo.se",
        "https://portal.autonexum.se",
        "https://.autonexum.se",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router,       prefix="/users",       tags=["Users"])
app.include_router(cars.router,        prefix="/cars",        tags=["Cars"])
app.include_router(customers.router,   prefix="/customers",   tags=["Customers"])
app.include_router(workshops.router,   prefix="/workshops",   tags=["Workshops"])
app.include_router(servicelogs.router, prefix="/servicelogs", tags=["Service Logs"])
app.include_router(servicebay.router, prefix="/servicebay", tags=["Servicebays"])
app.include_router(baybooking.router, prefix="/baybooking", tags=["Baybooking"])
app.include_router(workshopserviceitem.router, prefix="/workshop-service-items", tags=["Workshop Service Item"])
app.include_router(booking.router, prefix="/bookings", tags=["Bookings"])
app.include_router(crm.router, prefix="/crm", tags=["Customer Relationship Management"])
app.include_router(twilio_webhooks.router, prefix="/webhooks", tags=["Twilio Webhooks"])
app.include_router(bookingrequests.router, prefix="/bookingrequests", tags=["Bokningsförfrågningar"])
app.include_router(upsell.router, prefix="/upsell", tags=["Upsell"])

