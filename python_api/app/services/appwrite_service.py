import io
import hashlib
import asyncio
from typing import Optional, Dict, Any
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.input_file import InputFile
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.id import ID
from app.config import settings

DATABASE_ID = "divorce_ledger_db"
STORAGE_BUCKET_ID = "document_files"
FILES_COLLECTION = "files"

class AppwriteService:
    def __init__(self):
        self.is_configured = bool(
            settings.appwrite_endpoint and 
            settings.appwrite_project_id and 
            settings.appwrite_api_key
        )
        self.client = Client()
        if self.is_configured:
            self.client.set_endpoint(settings.appwrite_endpoint)
            self.client.set_project(settings.appwrite_project_id)
            self.client.set_key(settings.appwrite_api_key)
            self.databases = Databases(self.client)
            self.storage = Storage(self.client)

    async def upload_file(
        self,
        user_id: str,
        file_buffer: bytes,
        file_name: str,
        mime_type: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Uploads a file to Appwrite storage and creates a DB record"""
        if not self.is_configured:
            print("[Python Appwrite] Skipped: Appwrite is not configured in environment")
            return None

        options = options or {}
        
        # Calculate SHA256 file hash
        file_hash = hashlib.sha256(file_buffer).hexdigest()
        
        # 1. Upload to Storage
        try:
            input_file = InputFile.from_bytes(file_buffer, file_name, mime_type)
            storage_file = await asyncio.to_thread(
                self.storage.create_file,
                bucket_id=STORAGE_BUCKET_ID,
                file_id=ID.unique(),
                file=input_file,
                permissions=[
                    Permission.read(Role.user(user_id)),
                    Permission.update(Role.user(user_id)),
                    Permission.delete(Role.user(user_id)),
                ]
            )
            storage_file_id = storage_file["$id"]
        except Exception as e:
            print(f"[Python Appwrite] Failed to upload storage file: {e}")
            raise e
            
        # 2. Add document record to Database
        try:
            document_data = {
                "userId": user_id,
                "storageFileId": storage_file_id,
                "fileName": file_name,
                "fileType": mime_type,
                "fileSize": len(file_buffer),
                "fileHash": file_hash,
                "status": "uploaded",
                "title": options.get("title") or file_name,
                "description": options.get("description", None),
                "isConfidential": options.get("isConfidential", False),
                "category": options.get("category", None),
                "retryCount": 0,
            }
            
            if "extractedText" in options and options["extractedText"]:
                document_data["extractedText"] = options["extractedText"]

            file_doc = await asyncio.to_thread(
                self.databases.create_document,
                database_id=DATABASE_ID,
                collection_id=FILES_COLLECTION,
                document_id=ID.unique(),
                data=document_data,
                permissions=[
                    Permission.read(Role.user(user_id)),
                    Permission.update(Role.user(user_id)),
                    Permission.delete(Role.user(user_id)),
                ]
            )
            return file_doc
        except Exception as e:
            print(f"[Python Appwrite] Failed to create database record: {e}")
            # Consider rollback of storage file here in future iterations
            raise e

appwrite_service = AppwriteService()
