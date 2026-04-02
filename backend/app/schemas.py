from pydantic import BaseModel
from typing import Optional


class PlayerCreate(BaseModel):
    canonical_name: str
    is_sub: bool = False
    aliases: list[str] = []


class PlayerUpdate(BaseModel):
    canonical_name: Optional[str] = None
    is_sub: Optional[bool] = None
    add_aliases: list[str] = []
    remove_aliases: list[str] = []


class AliasResponse(BaseModel):
    id: int
    alias: str
    model_config = {"from_attributes": True}


class PlayerResponse(BaseModel):
    id: int
    canonical_name: str
    is_sub: bool
    aliases: list[AliasResponse]
    model_config = {"from_attributes": True}
