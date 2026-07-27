import os
from fastapi import Header, HTTPException


def require_admin(x_admin_token: str = Header(default="")):
    expected = os.environ.get("ADMIN_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=500, detail="ADMIN_TOKEN not configured")
    if x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
