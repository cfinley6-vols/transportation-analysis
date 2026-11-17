-- Insert Intersections (7 rows)
INSERT INTO INTERSECTIONS (MainStreet, CrossStreet, ControlType, Neighborhood) VALUES 
('Broadway', '5th Ave', 'Traffic Light', 'Downtown'),
('Main St', 'Elm St', 'Traffic Light', 'Uptown'),
('Oak St', 'Pine Ave', 'Stop Sign', 'Suburbs'),
('Market St', '1st Ave', 'Traffic Light', 'Downtown'),
('Washington Blvd', 'Lincoln Way', 'Roundabout', 'Westside'),
('Maple Dr', 'Cedar Ln', 'Uncontrolled', 'Suburbs'),
('7th St', 'Washington', 'Stop Sign', 'Suburbs'); -- NEW: Added to ensure a strict NULL match for LEFT JOIN tests

-- Insert Time Blocks (4 rows)
INSERT INTO TIME_BLOCKS (BlockName, StartTime, EndTime) VALUES 
('Morning Peak', '07:00', '09:00'),
('Midday', '11:00', '13:00'),
('Evening Peak', '16:00', '18:30'),
('Late Night', '22:00', '00:00');

-- Insert Transit Routes (4 rows)
INSERT INTO TRANSIT_ROUTES (RouteName, TransitType, DailyCapacity) VALUES 
('Red Line Express', 'Bus', 1500),
('Blue Line Local', 'Bus', 800),
('Downtown Tram', 'Light Rail', 5000),
('Westside Shuttle', 'Van', 300);

-- Insert Route Pathways (12 rows)
INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) VALUES 
(1, 1, 1, 1),
(1, 2, 2, 0),
(1, 4, 3, 1),
(2, 3, 1, 1),
(2, 2, 2, 1),
(2, 5, 3, 1),
(3, 1, 1, 1),
(3, 4, 2, 1),
(4, 5, 1, 1),
(4, 6, 2, 0),
(4, 3, 3, 1);

-- Insert Traffic Observations (30 rows)
INSERT INTO TRAFFIC_OBSERVATIONS (IntersectionID, TimeBlockID, ObservationDate, VehicleVolume, AvgWaitTimeSec, MaxQueueLength) VALUES 
(1, 1, '2026-10-20', 1200, 85, 25),
(1, 3, '2026-10-20', 1450, 110, 40),
(1, 1, '2026-10-21', 1150, 80, 22),
(1, 3, '2026-10-21', 1500, 120, 45),
(1, 4, '2026-10-21', 300, 15, 3),
(2, 1, '2026-10-20', 800, 45, 12),
(2, 2, '2026-10-20', 600, 30, 8),
(2, 3, '2026-10-20', 950, 60, 15),
(2, 1, '2026-10-21', 820, 48, 14),
(2, 3, '2026-10-21', 910, 55, 14),
(3, 1, '2026-10-20', 250, 10, 2),
(3, 3, '2026-10-20', 300, 12, 3),
(3, 4, '2026-10-20', 50, 5, 0),
(3, 1, '2026-10-21', 260, 11, 2),
(3, 3, '2026-10-21', 290, 12, 3),
(4, 1, '2026-10-20', 1100, 75, 20),
(4, 3, '2026-10-20', 1300, 95, 35),
(4, 2, '2026-10-21', 750, 40, 10),
(4, 1, '2026-10-21', 1120, 78, 22),
(4, 3, '2026-10-21', 1350, 105, 38),
(5, 1, '2026-10-20', 900, 20, 5),
(5, 3, '2026-10-20', 1050, 25, 8),
(5, 1, '2026-10-21', 880, 18, 4),
(5, 2, '2026-10-21', 500, 10, 2),
(5, 3, '2026-10-21', 1100, 30, 9),
(6, 1, '2026-10-20', 100, 2, 0),
(6, 3, '2026-10-20', 150, 3, 1),
(6, 1, '2026-10-21', 95, 2, 0),
(6, 2, '2026-10-21', 40, 1, 0),
(6, 3, '2026-10-21', 160, 4, 1);
