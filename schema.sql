PRAGMA foreign_keys = ON;

-- Clean up existing tables, views, and indexes to allow for clean recreation
DROP VIEW IF EXISTS v_transit_hub_congestion;
DROP INDEX IF EXISTS idx_observation_lookup;
DROP TABLE IF EXISTS ROAD_SEGMENTS;
DROP TABLE IF EXISTS ROUTE_PATHWAYS;
DROP TABLE IF EXISTS TRAFFIC_OBSERVATIONS;
DROP TABLE IF EXISTS TRANSIT_ROUTES;
DROP TABLE IF EXISTS TIME_BLOCKS;
DROP TABLE IF EXISTS INTERSECTIONS;

CREATE TABLE INTERSECTIONS (
    IntersectionID INTEGER PRIMARY KEY AUTOINCREMENT,
    MainStreet TEXT NOT NULL,      -- Constraint 1: NOT NULL (Main street must be known)
    CrossStreet TEXT NOT NULL,
    ControlType TEXT CHECK(ControlType IN ('Traffic Light', 'Stop Sign', 'Uncontrolled', 'Roundabout')), -- Constraint 2: CHECK (Restricts to valid types)
    Neighborhood TEXT,
    UNIQUE (MainStreet, CrossStreet) -- Added in D5: prevents the same intersection being entered twice
);

CREATE TABLE TIME_BLOCKS (
    TimeBlockID INTEGER PRIMARY KEY AUTOINCREMENT,
    BlockName TEXT UNIQUE NOT NULL, -- Constraint 3: UNIQUE (Cannot have duplicate block names like two 'Morning Rush' entries)
    StartTime TEXT NOT NULL,        -- Stored as 'HH:MM'
    EndTime TEXT NOT NULL
);

CREATE TABLE TRANSIT_ROUTES (
    RouteID INTEGER PRIMARY KEY AUTOINCREMENT,
    RouteName TEXT NOT NULL UNIQUE COLLATE NOCASE, -- Added in D5: route names must be unique
    TransitType TEXT NOT NULL,
    DailyCapacity INTEGER CHECK(DailyCapacity > 0)
);

CREATE TABLE TRAFFIC_OBSERVATIONS (
    ObservationID INTEGER PRIMARY KEY AUTOINCREMENT,
    IntersectionID INTEGER NOT NULL,
    TimeBlockID INTEGER NOT NULL,
    ObservationDate TEXT NOT NULL,   -- Stored as 'YYYY-MM-DD'
    VehicleVolume INTEGER DEFAULT 0 CHECK(VehicleVolume >= 0), -- Constraint 4: DEFAULT value
    AvgWaitTimeSec INTEGER CHECK(AvgWaitTimeSec >= 0),
    MaxQueueLength INTEGER CHECK(MaxQueueLength >= 0),
    -- Added in D5: one reading per intersection, time block, and day
    UNIQUE (IntersectionID, TimeBlockID, ObservationDate),
    FOREIGN KEY (IntersectionID) REFERENCES INTERSECTIONS(IntersectionID) ON DELETE CASCADE,
    FOREIGN KEY (TimeBlockID) REFERENCES TIME_BLOCKS(TimeBlockID) ON DELETE CASCADE
);

CREATE TABLE ROUTE_PATHWAYS (
    PathwayID INTEGER PRIMARY KEY AUTOINCREMENT,
    RouteID INTEGER NOT NULL,
    IntersectionID INTEGER NOT NULL,
    SequenceOrder INTEGER NOT NULL,
    HasTransitStop INTEGER NOT NULL CHECK(HasTransitStop IN (0, 1)), -- SQLite boolean representation
    -- Added in D5: a route cannot have two stops at the same position or visit an intersection twice
    UNIQUE (RouteID, SequenceOrder),
    UNIQUE (RouteID, IntersectionID),
    FOREIGN KEY (RouteID) REFERENCES TRANSIT_ROUTES(RouteID) ON DELETE CASCADE,
    FOREIGN KEY (IntersectionID) REFERENCES INTERSECTIONS(IntersectionID) ON DELETE CASCADE
);

-- Added in D5: streets connecting two intersections, whether or not a transit route uses them.
-- (Roads that a route travels are already implied by ROUTE_PATHWAYS.) A road is two-way, so
-- each pair is stored once with the lower ID first; the CHECK and UNIQUE together prevent
-- a road from an intersection to itself and the same road being stored twice (as A-B and B-A).
CREATE TABLE ROAD_SEGMENTS (
    RoadID INTEGER PRIMARY KEY AUTOINCREMENT,
    IntersectionA INTEGER NOT NULL,
    IntersectionB INTEGER NOT NULL,
    CHECK (IntersectionA < IntersectionB),
    UNIQUE (IntersectionA, IntersectionB),
    FOREIGN KEY (IntersectionA) REFERENCES INTERSECTIONS(IntersectionID) ON DELETE CASCADE,
    FOREIGN KEY (IntersectionB) REFERENCES INTERSECTIONS(IntersectionID) ON DELETE CASCADE
);

CREATE INDEX idx_observation_lookup ON TRAFFIC_OBSERVATIONS(IntersectionID, ObservationDate);

CREATE VIEW v_transit_hub_congestion AS
SELECT 
    i.MainStreet || ' & ' || i.CrossStreet AS IntersectionName,
    tr.RouteName,
    tb.BlockName,
    to_obs.AvgWaitTimeSec,
    to_obs.MaxQueueLength
FROM INTERSECTIONS i
JOIN ROUTE_PATHWAYS rp ON i.IntersectionID = rp.IntersectionID
JOIN TRANSIT_ROUTES tr ON rp.RouteID = tr.RouteID
JOIN TRAFFIC_OBSERVATIONS to_obs ON i.IntersectionID = to_obs.IntersectionID
JOIN TIME_BLOCKS tb ON to_obs.TimeBlockID = tb.TimeBlockID
WHERE rp.HasTransitStop = 1
ORDER BY to_obs.AvgWaitTimeSec DESC;
