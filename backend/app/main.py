from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import users, cars, customers, workshops, servicelogs

app = FastAPI(title="Autonexo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://portal.autonexo.se",
        "https://www.portal.autonexo.se",
        "https://www.autonexo.se",
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
