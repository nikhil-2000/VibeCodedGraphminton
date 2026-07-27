from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import get_filter_context
from ..services import anomalies as anomaly_service
from ..schemas import AnomalyEntry

router = APIRouter()


@router.get("/partnerships/overplayed", response_model=list[AnomalyEntry])
def partnerships_overplayed(
    limit: int = 10,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_partnership_anomalies(db, overplayed=True, limit=limit, player_ids=player_ids, season_id=season_id)


@router.get("/partnerships/underplayed", response_model=list[AnomalyEntry])
def partnerships_underplayed(
    limit: int = 10,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_partnership_anomalies(db, overplayed=False, limit=limit, player_ids=player_ids, season_id=season_id)


@router.get("/head-to-head/overplayed", response_model=list[AnomalyEntry])
def head_to_head_overplayed(
    limit: int = 10,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=True, limit=limit, player_ids=player_ids, season_id=season_id)


@router.get("/head-to-head/underplayed", response_model=list[AnomalyEntry])
def head_to_head_underplayed(
    limit: int = 10,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=False, limit=limit, player_ids=player_ids, season_id=season_id)


@router.get("/partnerships/overplayed/{player_id}", response_model=list[AnomalyEntry])
def partnerships_overplayed_for_player(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_partnership_anomalies(
        db, overplayed=True, limit=None,
        player_ids=player_ids, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/partnerships/underplayed/{player_id}", response_model=list[AnomalyEntry])
def partnerships_underplayed_for_player(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_partnership_anomalies(
        db, overplayed=False, limit=None,
        player_ids=player_ids, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/head-to-head/overplayed/{player_id}", response_model=list[AnomalyEntry])
def head_to_head_overplayed_for_player(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_head_to_head_anomalies(
        db, overplayed=True, limit=None,
        player_ids=player_ids, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/head-to-head/underplayed/{player_id}", response_model=list[AnomalyEntry])
def head_to_head_underplayed_for_player(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return anomaly_service.get_head_to_head_anomalies(
        db, overplayed=False, limit=None,
        player_ids=player_ids, season_id=season_id,
        focus_player_id=player_id,
    )
