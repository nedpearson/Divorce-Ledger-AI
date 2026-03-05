import uuid
import datetime
from sqlalchemy import String, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import BaseModel

class Workspace(BaseModel):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False) # 'consumer' or 'firm'
    owner_id: Mapped[str] = mapped_column(String(100), nullable=False) # Maps to users.id
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    subscription_tier: Mapped[str] = mapped_column(String(50), nullable=False, default="free")
    subscription_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    billing_cycle_start: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_credits_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_credits_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    # Relationships
    members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")

class WorkspaceMember(BaseModel):
    __tablename__ = "workspace_members"

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False) # Maps to users.id
    role: Mapped[str] = mapped_column(String(20), nullable=False) # 'owner', 'admin', 'staff', 'client'
    invited_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    joined_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
