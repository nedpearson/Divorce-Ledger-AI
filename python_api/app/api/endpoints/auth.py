from fastapi import APIRouter, Depends

router = APIRouter()

# Placeholder for Authentication, Session parsing, and Auth Tokens
# To be implemented against 'sessions' and 'users' Postgres schema

@router.post("/login")
async def login():
    """Authenticates using email/password and signs an HTTPOnly session cookie"""
    return {"message": "Not Implemented"}

@router.get("/me")
async def read_users_me():
    """Parses session cookie and returns core context properties for the UI"""
    return {"message": "Not Implemented"}
