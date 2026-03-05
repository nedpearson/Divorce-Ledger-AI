from fastapi import APIRouter
from app.api.endpoints import health

api_router = APIRouter()

# Register core endpoints
api_router.include_router(health.router, tags=["Health"])

# Placeholders for future decoupled domain modules:
from app.api.endpoints import workspaces
# from app.api.endpoints import auth, cases, ledger, documents, reports
# api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
# api_router.include_router(cases.router, prefix="/cases", tags=["Cases"])
# api_router.include_router(ledger.router, prefix="/ledger", tags=["Ledger"])
# api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
# api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
