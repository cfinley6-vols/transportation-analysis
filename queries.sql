-- Requirement 1: Filtering and Sorting
-- Identifies high-traffic observations (over 1,000 vehicles) and sorts them by highest volume to help planners spot peak congestion events.
SELECT 
    IntersectionID, 
    ObservationDate, 
    VehicleVolume, 
    AvgWaitTimeSec 
FROM TRAFFIC_OBSERVATIONS 
WHERE VehicleVolume > 1000 
ORDER BY VehicleVolume DESC, AvgWaitTimeSec DESC;

-- Requirement 2: INNER JOIN
-- Combines TIME_BLOCKS and TRAFFIC_OBSERVATIONS to show the average wait times and max queue lengths alongside their descriptive time block names.
SELECT 
    tb.BlockName, 
    to_obs.ObservationDate, 
    to_obs.VehicleVolume, 
    to_obs.AvgWaitTimeSec
FROM TIME_BLOCKS tb
INNER JOIN TRAFFIC_OBSERVATIONS to_obs 
    ON tb.TimeBlockID = to_obs.TimeBlockID;

-- Requirement 3: LEFT JOIN
-- Lists all intersections and any matching traffic observations for the 'Late Night' block (TimeBlockID = 4).
-- Intersections with no late-night data (like Main St & 3rd Ave, or the newly built Cedar Ln & Pine Ave) will appear with NULL observation values, highlighting gaps in our data collection.
SELECT 
    i.MainStreet, 
    i.CrossStreet, 
    to_obs.ObservationDate,
    to_obs.VehicleVolume
FROM INTERSECTIONS i
LEFT JOIN TRAFFIC_OBSERVATIONS to_obs 
    ON i.IntersectionID = to_obs.IntersectionID 
    AND to_obs.TimeBlockID = 4;

-- Requirement 4: Three-Table Join
-- Maps out the exact turn-by-turn pathways for each transit route, displaying the route name alongside the human-readable intersection names in sequence order.
SELECT 
    tr.RouteName, 
    tr.TransitType,
    rp.SequenceOrder, 
    i.MainStreet || ' & ' || i.CrossStreet AS IntersectionName
FROM TRANSIT_ROUTES tr
JOIN ROUTE_PATHWAYS rp 
    ON tr.RouteID = rp.RouteID
JOIN INTERSECTIONS i 
    ON rp.IntersectionID = i.IntersectionID
ORDER BY tr.RouteName, rp.SequenceOrder;

-- Requirement 5: Aggregate Query
-- Calculates the absolute maximum queue length and the citywide average wait time across all recorded observations.
SELECT 
    MAX(MaxQueueLength) AS AbsoluteMaxQueue, 
    ROUND(AVG(AvgWaitTimeSec), 2) AS CitywideAvgWaitSeconds
FROM TRAFFIC_OBSERVATIONS;

-- Requirement 6: GROUP BY and HAVING
-- Groups traffic data by intersection to find nodes that consistently experience severe congestion (average wait time exceeding 60 seconds).
SELECT 
    IntersectionID, 
    ROUND(AVG(VehicleVolume), 0) AS AvgVolume,
    ROUND(AVG(AvgWaitTimeSec), 2) AS AvgWaitTime
FROM TRAFFIC_OBSERVATIONS
GROUP BY IntersectionID
HAVING AVG(AvgWaitTimeSec) > 60;

-- Requirement 7: Subquery
-- Identifies specific traffic observations where the vehicle volume was strictly greater than the overall historical average volume.
SELECT 
    IntersectionID, 
    ObservationDate, 
    VehicleVolume 
FROM TRAFFIC_OBSERVATIONS 
WHERE VehicleVolume > (
    SELECT AVG(VehicleVolume) 
    FROM TRAFFIC_OBSERVATIONS
);

-- Requirement 8: Set Operation
-- Uses INTERSECT to find which intersections act as transfer hubs by identifying intersections shared by both the 'Red Line Express' (Route 1) and 'Blue Line Local' (Route 2).
SELECT IntersectionID 
FROM ROUTE_PATHWAYS 
WHERE RouteID = 1

INTERSECT

SELECT IntersectionID 
FROM ROUTE_PATHWAYS 
WHERE RouteID = 2;

-- Requirement 9: View
-- Utilizes the v_transit_hub_congestion view created in Deliverable 3 to quickly pull intersections where transit routes are currently being bottlenecked by wait times over 50 seconds.
SELECT 
    IntersectionName, 
    RouteName, 
    BlockName, 
    AvgWaitTimeSec 
FROM v_transit_hub_congestion
WHERE AvgWaitTimeSec > 50;
