from fastapi import APIRouter, Depends

router = APIRouter()

# Placeholder for Matters/Cases entities

@router.get("/")
async def get_cases():
    """Fetches core active matters constrained by Tenant ID context"""
    return {"message": "Not Implemented"}

@router.get("/{case_id}")
async def get_case_details(case_id: str):
    return {"id": case_id, "message": "Not Implemented"}
