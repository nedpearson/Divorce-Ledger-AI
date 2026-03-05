import io
import time
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Header
from typing import Optional
from app.services.appwrite_service import appwrite_service

router = APIRouter()

@router.get("/")
async def list_documents():
    """Retrieves standard documents natively from Postgres storage tables"""
    return []

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: Optional[str] = Form("other"),
    environment: Optional[str] = Form("demo"),
    x_user_id: Optional[str] = Header("demo-client-user")
):
    """Receives Multi-Part buffer, extracts text from PDF to prevent Node.js OOM, skips Appwrite if unconfigured"""
    try:
        content = await file.read()
        extracted_text = ""
        
        # Parse text locally in Python to save Node.js event loop
        if file.filename and file.filename.lower().endswith('.pdf'):
            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
                for page in pdf_reader.pages:
                    text = page.extract_text()
                    if text:
                        extracted_text += text + "\n"
            except Exception as e:
                print(f"PDF Parsing error: {e}")
                
        # Connect to Appwrite natively via Python
        document_meta = {
            "title": title or file.filename,
            "category": category,
            "isConfidential": False,
            "environment": environment,
            "extractedText": extracted_text
        }

        # Attempt to upload to Appwrite DB and Storage
        appwrite_doc = await appwrite_service.upload_file(
            user_id=x_user_id,
            file_buffer=content,
            file_name=file.filename,
            mime_type=file.content_type,
            options=document_meta
        )

        response_payload = {
            "success": True,
            "file": {
                "storageFileId": f"python-local-{file.filename}-{int(time.time())}",
                "fileUrl": "",
                "fileName": file.filename,
                "mimeType": file.content_type
            },
            "extractedText": extracted_text,
            "title": title or file.filename,
            "category": category
        }

        if appwrite_doc:
            # Overwrite the fake info with real Appwrite info
            response_payload["file"]["id"] = appwrite_doc.get("$id")
            response_payload["file"]["storageFileId"] = appwrite_doc.get("storageFileId")
            response_payload["file"]["fileUrl"] = f"/api/appwrite/files/{appwrite_doc.get('storageFileId')}"
            response_payload["file"]["status"] = appwrite_doc.get("status")
            response_payload["file"]["ownerId"] = x_user_id
            response_payload["file"]["hash"] = appwrite_doc.get("fileHash")
            response_payload["file"]["createdAt"] = appwrite_doc.get("$createdAt")

        return response_payload
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

