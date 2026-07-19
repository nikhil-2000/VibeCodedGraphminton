from datetime import date
from typing import Optional
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .database import Base


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    start_date: Mapped[date] = mapped_column(nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(nullable=True)

    games: Mapped[list["Game"]] = relationship(back_populates="season")
    player_roles: Mapped[list["PlayerSeasonRole"]] = relationship(back_populates="season")


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    canonical_name: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    aliases: Mapped[list["PlayerAlias"]] = relationship(
        back_populates="player", cascade="all, delete-orphan"
    )
    game_players: Mapped[list["GamePlayer"]] = relationship(back_populates="player")
    season_roles: Mapped[list["PlayerSeasonRole"]] = relationship(back_populates="player")


class PlayerSeasonRole(Base):
    __tablename__ = "player_season_roles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    is_sub: Mapped[bool] = mapped_column(default=False, nullable=False)

    player: Mapped["Player"] = relationship(back_populates="season_roles")
    season: Mapped["Season"] = relationship(back_populates="player_roles")

    __table_args__ = (
        UniqueConstraint("player_id", "season_id", name="uq_player_season"),
    )


class PlayerAlias(Base):
    __tablename__ = "player_aliases"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    alias: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    player: Mapped["Player"] = relationship(back_populates="aliases")


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    played_on: Mapped[date] = mapped_column(nullable=False)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    game_number: Mapped[int] = mapped_column(nullable=False)
    team_a_score: Mapped[int] = mapped_column(nullable=False)
    team_b_score: Mapped[int] = mapped_column(nullable=False)

    season: Mapped["Season"] = relationship(back_populates="games")
    game_players: Mapped[list["GamePlayer"]] = relationship(back_populates="game")

    __table_args__ = (
        UniqueConstraint("played_on", "game_number", name="uq_date_game"),
    )


class GamePlayer(Base):
    __tablename__ = "game_players"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    team: Mapped[str] = mapped_column(String(1), nullable=False)  # 'A' or 'B'

    game: Mapped["Game"] = relationship(back_populates="game_players")
    player: Mapped["Player"] = relationship(back_populates="game_players")

    __table_args__ = (
        UniqueConstraint("game_id", "player_id", name="uq_game_player"),
    )
