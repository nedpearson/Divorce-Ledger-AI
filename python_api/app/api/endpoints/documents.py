from fastapi import APIRouter, Depends, UploadFile, File

router = APIRouter()

# Placeholder for Document Intake, Blob Storage routing, and AI OCR processing

@router.get("/")
async def list_documents():
    """Retrieves standard documents natively from Postgres storage tables"""
    return []

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Receives Multi-Part buffer, pushes to S3/Appwrite, fires OCR background task"""
    return {"message": "Not Implemented", "filename": file.filename}
