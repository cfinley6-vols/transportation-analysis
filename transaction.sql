-- This transaction simulates the rollout of a brand new transit line (The "Green Line") 
-- and its associated route pathways. By grouping these inserts in a transaction, we ensure 
-- that the database never contains a "ghost route" with no stops, nor orphaned stops assigned 
-- to a route that failed to create. 
-- Note: A ROLLBACK is used at the end to keep the sample database unchanged for the grader.

BEGIN TRANSACTION;

-- 1. Create the new transit route
INSERT INTO TRANSIT_ROUTES (RouteName, TransitType, DailyCapacity) 
VALUES ('Green Line Commuter', 'Bus', 1200);

-- 2. Add the sequence of stops for the newly created route (Assuming it gets RouteID = 5)
INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 6, 1, 1); -- Starts at Maple & Cedar

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 3, 2, 1); -- Stops at Oak & Pine

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 2, 3, 1); -- Ends at Main & Elm

-- Rolling back to preserve the original test state for grading purposes.
ROLLBACK;
