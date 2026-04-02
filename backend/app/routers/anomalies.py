from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import anomalies as anomaly_service
from ..schemas import AnomalyEntry

router = APIRouter()


@router.get("/partnerships/overplayed", response_model=list[AnomalyEntry])
def partnerships_overplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_partnership_anomalies(db, overplayed=True, limit=limit)


@router.get("/partnerships/underplayed", response_model=list[AnomalyEntry])
def partnerships_underplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_partnership_anomalies(db, overplayed=False, limit=limit)


@router.get("/head-to-head/overplayed", response_model=list[AnomalyEntry])
def head_to_head_overplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=True, limit=limit)


@router.get("/head-to-head/underplayed", response_model=list[AnomalyEntry])
def head_to_head_underplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=False, limit=limit)
