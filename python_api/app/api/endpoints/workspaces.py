from typing import List
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.dependencies import get_current_user, get_current_workspace
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, UserWorkspaceResponse

router = APIRouter()

# ============================================================================
# WORKSPACE ROUTES (Migrated mapping verbatim from Express workspace-billing.routes.ts)
# ============================================================================

@router.get("", response_model=List[UserWorkspaceResponse])
async def get_workspaces(
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(get_current_user)
):
    """
    GET /api/workspaces
    Get user's associated workspaces flattened into frontend schemas
    """
    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.user_id == current_user["id"])
        .options(selectinload(WorkspaceMember.workspace))
    )
    result = await db.execute(stmt)
    memberships = result.scalars().all()

    # Flatten the relationship exactly match TypeScript UI expectations
    workspaces_payload = []
    for m in memberships:
        flat_workspace = m.workspace.__dict__.copy()
        flat_workspace["role"] = m.role
        flat_workspace["joinedAt"] = m.joined_at
        flat_workspace["id"] = m.workspace.id
        # Explicit mapping expected by Pydantic models due to camelCase Aliases
        workspaces_payload.append(flat_workspace)

    return workspaces_payload

@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    data: WorkspaceCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(get_current_user)
):
    """
    POST /api/workspaces
    Create new workspace mapped exactly to UI payloads
    """
    # 1. Create the workspace
    new_workspace = Workspace(
        name=data.name,
        type=data.type,
        owner_id=current_user["id"],
        subscription_tier="free",
        ai_credits_balance=100,
        ai_credits_limit=100
    )
    db.add(new_workspace)
    await db.flush() # Yields the UUID but avoids committing globally yet
    
    # 2. Add current user as 'owner'
    new_member = WorkspaceMember(
        workspace_id=new_workspace.id,
        user_id=current_user["id"],
        role="owner",
        joined_at=datetime.now(timezone.utc)
    )
    db.add(new_member)
    
    await db.commit()
    await db.refresh(new_workspace)
    
    return new_workspace

@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace_details(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    workspace_context: dict = Depends(get_current_workspace) 
    # the middleware dependency asserts the user natively belongs to this ID
):
    """
    GET /api/workspaces/:workspaceId
    Get detailed tenant data
    """
    stmt = select(Workspace).where(Workspace.id == workspace_id)
    result = await db.execute(stmt)
    workspace = result.scalars().first()
    
    if not workspace:
        # FastAPI will auto-format this into `{detail: "Not Found"}`
        # The frontend API catches the generic 404 code specifically
        raise HTTPException(status_code=404, detail="Workspace not found")

    return workspace
