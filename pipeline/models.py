from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class Visit:
    id: int
    start: int          # utc epoch s
    end: int
    tz: int             # offset minutes from timestamp string
    place_id: str
    lat: float
    lng: float
    semantic_type: str  # UNKNOWN | INFERRED_HOME | HOME | INFERRED_WORK | WORK | SEARCHED_ADDRESS
    probability: float
    city: str | None = None
    country_code: str | None = None
    dist_from_home_km: float | None = None


@dataclass
class Activity:
    id: int
    start: int
    end: int
    tz: int
    s_lat: float
    s_lng: float
    e_lat: float
    e_lng: float
    distance_m: float
    mode: str
    probability: float
    s_city: str | None = None
    e_city: str | None = None
    e_country_code: str | None = None


@dataclass
class PathPoint:
    ts: int
    lat: float
    lng: float


@dataclass
class Path:
    start: int
    end: int
    pts: list[PathPoint]


@dataclass
class Position:
    ts: int
    lat: float
    lng: float
    acc: float
    alt: float | None
    spd: float | None
    src: str


@dataclass
class MemoryTrip:
    start: int
    end: int
    distance_from_origin_km: int
    destination_place_ids: list[str]


@dataclass
class Profile:
    frequent_places: list[dict]
    frequent_trips: list[dict]
    persona: dict


@dataclass
class ImportReport:
    segments_total: int = 0
    parsed: int = 0
    skipped_by_reason: dict[str, int] = field(default_factory=dict)

    def skip(self, reason: str) -> None:
        self.skipped_by_reason[reason] = self.skipped_by_reason.get(reason, 0) + 1


@dataclass
class Parsed:
    visits: list[Visit]
    activities: list[Activity]
    paths: list[Path]
    positions: list[Position]
    memory_trips: list[MemoryTrip]
    profile: Profile
    report: ImportReport
