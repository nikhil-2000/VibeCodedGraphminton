from sqlalchemy import (
    Column, Integer, String, Boolean, Date,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .database import Base


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    canonical_name = Column(String, unique=True, nullable=False, index=True)
    is_sub = Column(Boolean, default=False, nullable=False)

    aliases = relationship("PlayerAlias", back_populates="player", cascade="all, delete-orphan")
    game_players = relationship("GamePlayer", back_populates="player")


class PlayerAlias(Base):
    __tablename__ = "player_aliases"

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    alias = Column(String, unique=True, nullable=False, index=True)

    player = relationship("Player", back_populates="aliases")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    played_on = Column(Date, nullable=False)
    week_number = Column(Integer, nullable=False)
    game_number = Column(Integer, nullable=False)
    team_a_score = Column(Integer, nullable=False)
    team_b_score = Column(Integer, nullable=False)

    game_players = relationship("GamePlayer", back_populates="game")

    __table_args__ = (
        UniqueConstraint("week_number", "game_number", name="uq_week_game"),
    )


class GamePlayer(Base):
    __tablename__ = "game_players"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team = Column(String(1), nullable=False)  # 'A' or 'B'

    game = relationship("Game", back_populates="game_players")
    player = relationship("Player", back_populates="game_players")
