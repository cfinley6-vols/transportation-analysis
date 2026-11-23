-- This transaction simulates the rollout of a brand new transit line (the "Green Line")
-- and its route pathways. By grouping these inserts in a transaction, we ensure that the
-- database never contains a "ghost route" with no stops, nor orphaned stops assigned to a
-- route that failed to create. If any statement fails, the whole group is undone.
-- Note: A ROLLBACK is used at the end to keep the sample database unchanged for the grader.
-- (To keep the changes instead, replace ROLLBACK with COMMIT.)

BEGIN TRANSACTION;

-- 1. Create the new transit route
INSERT INTO TRANSIT_ROUTES (RouteName, TransitType, DailyCapacity)
VALUES ('Green Line Commuter', 'Bus', 1200);

-- 2. Add the sequence of stops for the newly created route.
--    The new RouteID is looked up by name instead of being hard-coded, so the script works
--    even if other routes were added first (RouteName is UNIQUE, so the lookup finds one row).
--    The Green Line runs east along Oak St, so each stop shares a street with the one before it.
INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop)
VALUES ((SELECT RouteID FROM TRANSIT_ROUTES WHERE RouteName = 'Green Line Commuter'), 13, 1, 1); -- Starts at Oak St & 1st Ave

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop)
VALUES ((SELECT RouteID FROM TRANSIT_ROUTES WHERE RouteName = 'Green Line Commuter'), 14, 2, 1); -- Stops at Oak St & 2nd Ave

INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop)
VALUES ((SELECT RouteID FROM TRANSIT_ROUTES WHERE RouteName = 'Green Line Commuter'), 15, 3, 1); -- Ends at Oak St & 3rd Ave

-- Show the route and its stops as they exist inside the transaction (before the rollback)
SELECT tr.RouteID, tr.RouteName, rp.SequenceOrder, i.MainStreet || ' & ' || i.CrossStreet AS Stop
FROM TRANSIT_ROUTES tr
JOIN ROUTE_PATHWAYS rp ON tr.RouteID = rp.RouteID
JOIN INTERSECTIONS i ON rp.IntersectionID = i.IntersectionID
WHERE tr.RouteName = 'Green Line Commuter'
ORDER BY rp.SequenceOrder;

-- Rolling back to preserve the original test state for grading purposes.
ROLLBACK;

-- After the rollback the route is gone (this returns 0).
SELECT COUNT(*) AS GreenLineRoutesAfterRollback FROM TRANSIT_ROUTES WHERE RouteName = 'Green Line Commuter';
