from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import users, cars, customers, workshops, servicelogs

app = FastAPI()

# Inkludera routes
app.include_router(users.router, prefix="/users", tags=["Användare / Users"])
app.include_router(cars.router, prefix="/cars", tags=["Bilar / Cars"])
app.include_router(customers.router, prefix="/customers", tags=["Kunder / Customers"])
app.include_router(workshops.router, prefix="/workshops", tags=["Verkstäder / Workshops"])
app.include_router(servicelogs.router, prefix="/servicelogs", tags=["Service Logs"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # eller ["*"] för utveckling
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)