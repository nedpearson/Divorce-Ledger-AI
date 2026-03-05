from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db_session

router = APIRouter()

@router.get("/health/python")
async def health_check(db: AsyncSession = Depends(get_db_session)):
    """Basic health check ensuring the Python worker and DB are responsive."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ok",
        "service": "core_api",
        "database": db_status
    }
