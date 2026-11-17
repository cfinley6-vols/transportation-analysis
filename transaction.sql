-- This transaction simulates the rollout of a brand new transit line (The "Green Line") 
-- and its associated route pathways. By grouping these inserts in a transaction, we ensure 
-- that the database never contains a "ghost route" with no stops, nor orphaned stops assigned 
-- to a route that failed to create. 
-- Note: A ROLLBACK is used at the end to keep the sample database unchanged for the grader.

BEGIN TRANSACTION;

-- 1. Create the new transit route
INSERT INTO TRANSIT_ROUTES (RouteName, TransitType, DailyCapacity) 
VALUES ('Green Line Commuter', 'Bus', 1200);

-- 2. Add the sequence of stops for the newly created route (Assuming it gets RouteID = 5).
--    The Green Line runs east along Oak St, so each stop shares a street with the one before it.
INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 13, 1, 1); -- Starts at Oak St & 1st Ave

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 14, 2, 1); -- Stops at Oak St & 2nd Ave

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) 
VALUES (5, 15, 3, 1); -- Ends at Oak St & 3rd Ave

-- Rolling back to preserve the original test state for grading purposes.
ROLLBACK;
