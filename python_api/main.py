from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.logging import setup_logging
from app.api.router import api_router

# Initialize early logging
setup_logging()

app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    openapi_url=f"{settings.api_v1_str}/openapi.json",
    description="Python core layer for Divorce-Ledger-AI multi-tenant operations."
)

# Secure CORS handling (Matches existing node config boundaries)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should be locked down to React's host strictly in PROD
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register central router map under matching Express schema boundary
app.include_router(api_router, prefix=settings.api_v1_str)

@app.get("/")
def root():
    """Diagnostic root endpoint"""
    return {
        "message": "Divorce-Ledger-AI Python Core Scaffold Initialized",
        "health": f"{settings.api_v1_str}/health/python",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    # This block allows running purely local python main.py 
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.debug)
