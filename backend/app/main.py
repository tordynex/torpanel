from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import users, cars, customers, workshops, servicelogs
from app import models
from app.database import Base, engine

app = FastAPI()

Base.metadata.create_all(bind=engine)

# Inkludera routes
app.include_router(users.router, prefix="/users", tags=["Användare / Users"])
app.include_router(cars.router, prefix="/cars", tags=["Bilar / Cars"])
app.include_router(customers.router, prefix="/customers", tags=["Kunder / Customers"])
app.include_router(workshops.router, prefix="/workshops", tags=["Verkstäder / Workshops"])
app.include_router(servicelogs.router, prefix="/servicelogs", tags=["Service Logs"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://autonexo-frontend.onrender.com", "https://www.portal.autonexo.se", "https://www.autonexo.se"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
