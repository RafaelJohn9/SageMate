from pydantic import BaseModel
from typing import Optional


class MessageBase(BaseModel):
    role: str
    name: Optional[str] = None
    content: str
