import uuid
from typing import Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

# Base schema for Workspaces
class WorkspaceBase(BaseModel):
    name: str = Field(..., max_length=255)
    type: Literal["consumer", "firm"]
    
# Request for creating a Workspace
class WorkspaceCreate(WorkspaceBase):
    pass

# Response for Workspace
class WorkspaceResponse(WorkspaceBase):
    id: uuid.UUID
    owner_id: str = Field(alias="ownerId")
    stripe_customer_id: Optional[str] = Field(default=None, alias="stripeCustomerId")
    stripe_subscription_id: Optional[str] = Field(default=None, alias="stripeSubscriptionId")
    subscription_tier: str = Field(default="free", alias="subscriptionTier")
    subscription_status: Optional[str] = Field(default=None, alias="subscriptionStatus")
    billing_cycle_start: Optional[datetime] = Field(default=None, alias="billingCycleStart")
    ai_credits_balance: int = Field(default=0, alias="aiCreditsBalance")
    ai_credits_limit: int = Field(default=100, alias="aiCreditsLimit")
    settings: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# Flattened UI Model returned from "GET /api/workspaces" array
class UserWorkspaceResponse(WorkspaceResponse):
    role: str
    joined_at: datetime = Field(alias="joinedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
