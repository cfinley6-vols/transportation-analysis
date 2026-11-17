# Deliverable 5: Application
## Project: Transit Analysis Database

An interactive, visual web application for city transit planners, using the hypothetical city from Deliverables 3 and 4. It shows transit routes and traffic as a live, animated map. You can search intersections, record and correct traffic observations, view routes, run congestion reports, build roads, and plan new routes, all without typing SQL.

**Architecture:** web page (HTML/CSS/JavaScript) → Node.js server (JavaScript) → SQLite database

---

## 1. Requirements

| Item | Details |
|---|---|
| Language | JavaScript (Node.js for the server, plain JavaScript in the browser) |
| Node.js | **Version 22.13 or newer** (tested with Node 24). Download the LTS version from https://nodejs.org/ |
| Database | SQLite, through Node's built-in `node:sqlite` module |
| Packages | **None.** The app uses only Node's built-in modules, so `npm install` is not needed. |
| Browser | Any current version of Chrome, Firefox, Safari, or Edge |
| OS | macOS, Linux, or Windows |

Check your Node version:
```
node --version
```

---

## 2. Setup and running

Run all commands from the project folder (the folder that contains `package.json`).

**Step 1: Create the database** from the submitted SQL files:
```
npm run setup
```
This deletes any existing `transit.db`, then rebuilds it by running `schema.sql` followed by `insert_data.sql`. It prints the row count of each table:
```
  INTERSECTIONS            7 rows
  TIME_BLOCKS              4 rows
  TRANSIT_ROUTES           4 rows
  ROUTE_PATHWAYS          11 rows
  ROAD_SEGMENTS            0 rows
  TRAFFIC_OBSERVATIONS    30 rows
```
Run it again at any time to reset the data to its original state.

(Another option: the Deliverable 4 script `./run_queries.sh` also rebuilds `transit.db` with the `sqlite3` command-line tool and runs the D4 queries.)

**Step 2: Start the application:**
```
npm start
```
This starts a local server and opens **http://127.0.0.1:8000/** in your default browser. If the browser does not open, paste that address into a browser. Press **Ctrl+C** in the terminal to stop the server.

Options (put them after `--`):
```
npm start -- --port 8080        # use a different port
npm start -- --no-browser       # don't open a browser automatically
```

> Node marks `node:sqlite` as "experimental" and normally prints a warning about it. The npm scripts turn that warning off. If you run `node src/server/index.js` directly, the warning appears but is harmless.

### Database connection configuration
SQLite is a local file, so the app needs no server, username, or password. By default it uses `transit.db` in the project folder. To use a different file, set an environment variable before starting the app:
```
TRANSIT_DB_PATH=/path/to/other.db npm start                 # macOS / Linux
set TRANSIT_DB_PATH=C:\path\to\other.db && npm start         # Windows cmd
```
These settings live in `src/config.js`. Each connection turns on `PRAGMA foreign_keys = ON` so that foreign keys are enforced. Each request to the server opens its own connection and closes it when the request finishes.

Optional: set `TRANSIT_DEBUG=1` to log raw database errors in the terminal. They are never sent to the browser.

---

## 3. Using the application

The sidebar has six screens. Every screen lists its main SQL techniques as small tags under the title.

### Required operations and where to find them

| # | Required category | Where in the app | Database technique |
|---|---|---|---|
| 1 | **Search / browse** | **Intersections**: filter by street, neighborhood, and control type; results update as you type.<br>**Observations**: filter by intersection, date range, and minimum volume; choose a sort order and row limit. | Parameterized `WHERE`/`LIKE`, `ORDER BY`, `LIMIT` |
| 2 | **Display related data** | **Network map**: every intersection, ringed by its level of service, with each transit route drawn through its intersections and every road between them. Click an intersection to see its routes and traffic by time block. Click a route to see its ordered path.<br>**Routes**: the selected route's stops with congestion at each, as a table and a line diagram. | Joins across the tables; `LEFT JOIN` + `GROUP BY` |
| 3 | **Add data** | **+ Observation** button (Network map, Observations, or an intersection's profile).<br>**+ Intersection** button (Network map or Intersections).<br>**Network map**: drag from one intersection to another and choose **Build a road**. | `INSERT` |
| 4 | **Update / delete** | **Observations**: **Edit** (`UPDATE`) or **Delete** (`DELETE`, asks for confirmation) on any row.<br>**Routes**: **Edit capacity** (`UPDATE`).<br>**Network map**: drag between two intersections to **extend a route** that ends at the first (or starts at the second), or to **Remove the road** between them. | `UPDATE`, `DELETE`; extending a route is a **transaction** (renumber + `INSERT`) |
| 5 | **Summary / report** | **Reports**: three tabs, each with a chart and a table.<br>*Intersection congestion* (threshold slider), *Traffic by time of day* (date range; choose the metric to chart), and *Transit stop bottlenecks* (uses the `v_transit_hub_congestion` view). | `JOIN`, `AVG`/`MAX`/`SUM`/`COUNT`, `GROUP BY`, `HAVING`, view |
| 6 | **Additional operation** | **Plan a route**: name the route, click intersections on the map in travel order, mark each one Stop or Pass, then **Launch route**. (Dragging between two intersections on the Network map and choosing *Start a new route* opens this screen with both already filled in.)<br>**Routes → Find transfer points**: compare two routes; shared intersections are listed and ringed on a map. | Multi-statement **transaction**; self-join on `ROUTE_PATHWAYS` |

### The live network map
The Network map is a top-down, animated view of the city. Everything that moves comes from the database values for the time of day chosen under **Traffic for**:

| What you see | Driven by |
|---|---|
| Where each intersection is | The roads between them: intersections that share a road are pulled together, and each neighborhood is grouped (the database stores no coordinates, so the map is a diagram) |
| Ring color (and glow) around each intersection | Average delay → level of service **LOS A–F** (see below) |
| How many car trips start at each intersection | Average vehicle volume (no cars if there are no readings) |
| Red/green stop bars, stop-sign turns, or free-flowing merges | `ControlType` |
| How long reds last, so how much traffic backs up | Average wait time |
| Roads between intersections | The route segments in `ROUTE_PATHWAYS`, plus roads built without a route (`ROAD_SEGMENTS`) |
| Buses, trams, and vans on each route | `TRANSIT_ROUTES` (`DailyCapacity` sets how many run; the type sets the shape) |
| Where transit vehicles pause, and for how long | `HasTransitStop`, plus the average wait at that intersection |

For example, switching from *Late Night* to *Evening Peak* fills the downtown roads around Broadway & 5th Ave and Market St & 1st Ave with cars. Use **Pause** to freeze the motion. If the operating system asks for reduced motion, the map starts paused.

**Level of service (LOS).** Congestion is graded with the Highway Capacity Manual's level of service for signalized intersections, the standard measure traffic engineers use. It is computed in SQL from the average delay: **A** ≤ 10 s, **B** ≤ 20 s, **C** ≤ 35 s, **D** ≤ 55 s, **E** ≤ 80 s, **F** > 80 s. In the sample data, the two downtown signals average LOS E–F, and the suburban intersections grade A.

Each marker shows its ID and name (`#4 Market St & 1st Ave`). If the map grows past 12 intersections, only the IDs are shown until you hover over one, select it, or highlight a route through it. Roads are drawn as straight lines. Cars start and end their trips at intersections, so they appear and fade out there. The traffic is a simulation for display only: it reads data but never writes any.

**Connecting two intersections.** Press on an intersection and drag to another one; a dashed line follows the pointer, and letting go on an intersection opens a dialog (letting go anywhere else cancels). The dialog offers whichever of these apply:
- **Build a road**: a plain two-way street between them, with traffic but no transit (stored in `ROAD_SEGMENTS`). Offered when the two aren't already connected by a road or a route. It saves immediately, and cars start using it.
- **Remove the road**: offered when a built road already connects them. It is never preselected, so deleting a road always takes a deliberate choice. Roads that routes travel can't be removed this way, because they come from the routes themselves.
- **Extend a route**: offered for every route that ends at the first intersection (the second is added at the end) or starts at the second (the first is added at the start), as long as the route doesn't already visit the intersection being added. Choose whether it is a passenger stop. This saves immediately.
- **Start a new route**: opens **Plan a route** with the two intersections as its first stops, ready to name and launch.

### Suggested quick test
1. **Network map**: click **#1 Broadway & 5th Ave** to see its profile. Click *Red Line Express* in the route list to highlight it. Then switch **Traffic for** between *Late Night* and *Evening Peak* and watch the traffic change.
2. **+ Observation**: intersection 7 *7th St & Washington*, *Late Night*, date `2026-11-01`, volume `-5`. The form rejects it and highlights the field. Change the volume to `400` and save.
3. **Observations**: **Edit** that row, then **Delete** it.
4. **+ Observation** with intersection 1, *Morning Peak*, `2026-10-20`: rejected as a duplicate.
5. **Intersections**: type `Down` in *Neighborhood contains*. The 2 Downtown intersections are shown.
6. **Reports → Intersection congestion**: drag the slider to 60 s. Only Broadway & 5th Ave (LOS F) and Market St & 1st Ave (LOS E) remain.
7. **Plan a route**: click 7 → 3 → 2, give it a name, type `Bus`, capacity `700`, then **Launch route**. Using an existing name such as `Red Line Express` is rejected. Then compare the new route with another one under **Routes → Find transfer points**.
8. **Network map**: drag from **#7** to **#6** and choose **Build a road**. A new street appears and cars start driving on it. Drag between them again and choose **Remove the road**. Then drag from **#4** (where *Red Line Express* ends) to **#5**, choose **Extend Red Line Express**, and **Save**. The route now ends at #5 (see **Routes**).

---

## 4. The data: a hypothetical city

`insert_data.sql` is the made-up sample data from Deliverables 3 and 4, unchanged:
- **7 intersections** in four neighborhoods (Downtown, Uptown, Suburbs, Westside), covering every control type: traffic lights, stop signs, a roundabout, and an uncontrolled corner.
- **4 time blocks**: Morning Peak, Midday, Evening Peak, and Late Night.
- **4 transit routes** of three types: *Red Line Express* and *Blue Line Local* (bus), *Downtown Tram* (light rail), and *Westside Shuttle* (van), with 11 pathway rows between them.
- **30 traffic observations** from October 20–21, 2026.

*7th St & Washington* has no observations and no routes on purpose: it tests the `LEFT JOIN` queries, which must still list it with empty values, and it shows as *No data* on the map.

An earlier version of this project used real data for downtown Knoxville, TN. That version is saved in the `project-backup-knoxville` folder next to this project.

---

## 5. Design notes

### Program structure
The server code is organized **by feature**. Each feature folder has the same two files: `queries.js` holds only SQL, and `service.js` holds validation and rules.
```
package.json                 npm scripts: setup, start (no dependencies)
scripts/setup-db.js          Rebuilds transit.db from schema.sql + insert_data.sql

src/                         Server (Node.js)
  config.js                  Database path, port, debug setting
  node-version.js            Clear message if Node is too old
  db/
    connection.js            Open/verify the database, transactions, friendly error messages
    sql-fragments.js         Fixed SQL pieces reused by several queries
  shared/
    validate.js              Input validation (numbers, text, dates, choices)
    errors.js                ValidationError, NotFoundError, ConflictError
    constants.js             Numeric limits, control types
  features/
    intersections/           queries.js (SQL) + service.js (validation and rules)
    observations/            queries.js + service.js
    routes/                  queries.js + service.js (includes the transactions)
    roads/                   queries.js + service.js (roads built without a route)
    reports/                 queries.js + service.js
    network/                 queries.js + service.js (data for the map)
    time-blocks/             queries.js + service.js
  server/
    index.js                 Entry point (npm start)
    app.js                   HTTP server, request handling, startup and shutdown
    routes.js                Table of API endpoints, mapped to service functions
    http.js                  JSON in/out, static files, error → status code mapping

public/                      Web page (runs in the browser)
  index.html, css/app.css
  js/
    main.js                  Starts the page and switches screens
    api.js                   All calls to the server
    state.js                 Dropdown data, filters, and selections for this browser session
    forms.js                 Add / edit / delete dialogs
    panels.js                Intersection profile and route line diagram
    components/              Table, bar charts, dialog, buttons and inputs
    map/
      network-map.js         Draws the map layers and handles hover, click, and drag-to-connect
      layout.js              Places intersections (force-directed diagram of the road network)
      traffic.js             Live traffic simulation (cars, lanes, signals)
      transit.js             Buses, trams, and vans running their routes
      clock.js               Shared animation clock with pause/play
    views/                   One file per screen: map, intersections, observations,
                             routes, reports, plan
```

A request flows through the layers like this:
```
browser screen (public/js/views) → api.js → server/routes.js → features/<x>/service.js → features/<x>/queries.js → SQLite
```

### Parameterized SQL
Every user-supplied value is passed as a `?` placeholder with `db.prepare(sql).all(...params)`. User input is never concatenated into SQL text. Two places build SQL dynamically, and both are safe:
- **Optional search filters** (`intersections/queries.js`, `observations/queries.js`): the app combines fixed `WHERE` fragments written in the code. The user's values still go through the parameter list.
- **Sort order**: the browser sends a key such as `"wait"`. That key selects one fixed `ORDER BY` clause from a whitelist (`OBSERVATION_SORTS`), and any other key is rejected.

All filtering, sorting, joining, and aggregation happens in SQL. The browser only displays the rows the server returns. It does not keep its own copy of project data or compute totals itself.

### Input validation
All validation happens on the server (`src/shared/validate.js` and each feature's `service.js`), so it cannot be bypassed from the browser:
- Numeric ranges are checked:
  - vehicle volume: 0–100,000
  - wait time: 0–3,600 s
  - queue length: 0–1,000
  - route capacity: 1–1,000,000
- Values must be whole numbers. Text such as `abc` or `3.5` is rejected.
- Dates must be real `YYYY-MM-DD` dates (`2026-02-30` is rejected) and not in the future. A start date cannot be after an end date.
- IDs are checked for existence ("No intersection with ID 99").
- Required text cannot be blank and has a length limit. Dropdown values must be one of the allowed choices.
- Before inserting, the app checks for duplicates: the same observation slot, the same intersection (street order ignored), or the same route name.
- A new route needs at least 2 intersections and at least 1 passenger stop, and cannot repeat an intersection.

When the server rejects input, the form stays open, shows the message, and highlights the field.

### Error handling
The server turns every error into a clear message and an HTTP status code (`src/server/http.js`):

| Situation | Status | Example message |
|---|---|---|
| Invalid input | 400 | "Vehicle volume must be at least 0." |
| Record not found | 404 | "No traffic observation with ID 31." |
| Duplicate / constraint violation | 409 | "That record already exists (duplicate value)." |
| Database missing or not set up | 503 | "Database file not found … Run "npm run setup"" |
| Any other failure | 500 | "The database operation could not be completed." |

Stack traces and raw SQLite errors are never sent to the browser. If the server stops, the page says "Cannot reach the server" and the sidebar status turns red.

### Transactions
**Plan a route → Launch route** needs a real multi-step transaction. It inserts one `TRANSIT_ROUTES` row and several `ROUTE_PATHWAYS` rows, and these must succeed or fail together. `createRouteWithPathways` in `src/features/routes/queries.js` wraps them in `BEGIN … COMMIT`, using the `transaction()` helper in `src/db/connection.js`. If any insert fails, the helper runs `ROLLBACK`, so the database never holds a route without stops or stops without a route. This is the same scenario as `transaction.sql` from Deliverable 4, now done from the application.

**Connecting two intersections** (dragging on the Network map) is also a transaction. Adding an intersection at the start of a route means renumbering every existing stop (`SequenceOrder` 1, 2, 3 → 2, 3, 4) and then inserting the new row at position 1. `extendRoute` in `src/features/routes/queries.js` does both inside one `transaction()`, so a failure can't leave the route half-renumbered. The renumbering passes through negative numbers so that the `UNIQUE (RouteID, SequenceOrder)` constraint never sees two stops at the same position mid-update. Every other change is a single statement, so each one is atomic on its own.

---

## 6. Database changes since Deliverable 4

**Data:** unchanged. `insert_data.sql` is the same sample data as in Deliverable 4.

**New table** `ROAD_SEGMENTS` (`RoadID`, `IntersectionA`, `IntersectionB`): a street connecting two intersections, whether or not any route uses it. Before, the only connections were implied by consecutive stops in `ROUTE_PATHWAYS`, so a road could not exist without a transit route. Each intersection has many road segments, and each segment joins exactly two intersections, through two foreign keys to `INTERSECTIONS` (`ON DELETE CASCADE`). A road is two-way, so each pair is stored once with the lower ID first. The application puts the IDs in that order before inserting.

> The ER diagram image (`ERD Diagram for Transit Analysis Database.png`) does not yet show the `ROAD_SEGMENTS` table and needs to be updated.

**New constraints** (also marked `-- Added in D5`). These let the database reject duplicate and invalid data that the application could otherwise insert:

| Table | Constraint added | Why |
|---|---|---|
| `INTERSECTIONS` | `UNIQUE (MainStreet, CrossStreet)` | Prevents entering the same intersection twice |
| `TRANSIT_ROUTES` | `RouteName UNIQUE COLLATE NOCASE` | Route names identify routes to users |
| `TRAFFIC_OBSERVATIONS` | `UNIQUE (IntersectionID, TimeBlockID, ObservationDate)` | One reading per intersection, time block, and day |
| `TRAFFIC_OBSERVATIONS` | `CHECK (... >= 0)` on volume, wait, and queue | Negative counts are impossible |
| `ROUTE_PATHWAYS` | `UNIQUE (RouteID, SequenceOrder)` and `UNIQUE (RouteID, IntersectionID)` | A route cannot have two stops at the same position or visit an intersection twice |
| `ROAD_SEGMENTS` | `CHECK (IntersectionA < IntersectionB)` and `UNIQUE (IntersectionA, IntersectionB)` | No road from an intersection to itself, and the same road can't be stored twice as A–B and B–A |

**Deliverable 4 files:** `queries.sql`, `transaction.sql`, and `run_queries.sh` are unchanged from Deliverable 4 and still run without errors.

### Existing database objects (from Deliverable 3)
- **View `v_transit_hub_congestion`**: joins intersections, route pathways, routes, observations, and time blocks for intersections that have transit stops. The *Transit stop bottlenecks* report uses it.
- **Index `idx_observation_lookup`** on `TRAFFIC_OBSERVATIONS(IntersectionID, ObservationDate)`: supports the intersection and date filters on the Observations screen and the per-intersection lookups.

---

## 7. Files submitted

| File | Purpose |
|---|---|
| `package.json` | Project info and the npm commands |
| `src/` | Server source code (Node.js) |
| `public/` | Web page source code (HTML, CSS, browser JavaScript) |
| `scripts/setup-db.js` | Database setup script |
| `schema.sql` | Tables, constraints, view, index (updated for D5) |
| `insert_data.sql` | Sample data for the hypothetical city (Section 4) |
| `queries.sql`, `transaction.sql`, `run_queries.sh` | Deliverable 4 files (unchanged) |
| `ERD Diagram for Transit Analysis Database.png` | ER diagram |
| `README.md` | This file |
