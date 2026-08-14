# Task Manager API

An Express + in-memory task API, with a Jest/Supertest suite covering the service, route, and validation layers.

Original brief: **[ASSIGNMENT.md](./ASSIGNMENT.md)**

**Live URL:** _TBD_

---

## Setup

**Prerequisites:** Node.js 18 or newer (`engines.node` is set to `>=18.0.0`).

```bash
cd task-api
npm install
```

## Run

```bash
npm start
```

Listens on `process.env.PORT`, falling back to `3000` — so `http://localhost:3000` locally, and whatever port the host injects in deployment.

```bash
PORT=8080 npm start   # override
```

The data store is in-memory and resets on every restart.

## Test

```bash
npm test           # run the suite
npm run coverage   # run with a coverage report
```

---

## Endpoints

| Method   | Path                  | Description                                              | Codes              |
|----------|-----------------------|----------------------------------------------------------|--------------------|
| `GET`    | `/tasks`              | List tasks. Supports `?status=`, `?page=`, `?limit=`     | 200                |
| `GET`    | `/tasks/stats`        | Counts by status plus an overdue count                    | 200                |
| `POST`   | `/tasks`              | Create a task                                             | 201, 400           |
| `PUT`    | `/tasks/:id`          | Update a task                                             | 200, 400, 404      |
| `DELETE` | `/tasks/:id`          | Delete a task                                             | 204, 404           |
| `PATCH`  | `/tasks/:id/complete` | Mark a task complete                                      | 200, 404           |
| `PATCH`  | `/tasks/:id/assign`   | Assign, reassign, or unassign a task                      | 200, 400, 404      |

Pagination is 1-based: `?page=1` returns the first window. `page` or `limit` below `1` returns an empty list.

### Task shape

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 or null",
  "assignee": "string or null",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

### `PATCH /tasks/:id/assign`

Body: `{ "assignee": string | null }`

```bash
# assign (value is trimmed before storing)
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "  alice  "}'      # stored as "alice"

# reassign — overwrites, returns the updated task
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "bob"}'

# unassign — an explicit null clears the field
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": null}'
```

| Case                                            | Result |
|-------------------------------------------------|--------|
| Valid string (trimmed, non-empty)               | 200    |
| Explicit `null`                                 | 200 — unassigns |
| Key missing, or `undefined`                     | 400    |
| Empty or whitespace-only string                 | 400    |
| Non-string (number, boolean, object, array)     | 400    |
| Unknown `:id`                                   | 404    |

The body is validated before the id is looked up, matching `PUT /tasks/:id` — so an invalid body against an unknown id returns 400, not 404.

### Other requests

```bash
# create
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'

# filter and paginate
curl "http://localhost:3000/tasks?status=todo&page=1&limit=10"

# complete
curl -X PATCH http://localhost:3000/tasks/<id>/complete
```

---

## Coverage

From `npm run coverage`:

```
File                      % Stmts   % Branch   % Funcs   % Lines
All files                 98.75     97.89      96.66     98.62
  src/app.js              84.61     75         50        84.61
  src/routes/tasks.js     100       100        100       100
  src/services/taskService.js  100  96         100       100
  src/utils/validators.js 100       100        100       100
```

The only uncovered lines are the `app.listen` block in `src/app.js`, which sits behind `require.main === module` and is not reachable in-process under Jest.

**Suite: 139 tests — 128 passing, 11 failing.**

The 11 failures are intentional. They are assertions of correct behaviour against bugs that are still present in the codebase, so each one documents a defect rather than a broken test. One bug — the pagination off-by-one in `getPaginated` — has been fixed, and its tests now pass.

---

## Layout

```
task-api/
  src/
    app.js                     # Express app, JSON parsing, error handler
    routes/tasks.js            # Route handlers
    services/taskService.js    # Business logic + in-memory store
    utils/validators.js        # Input validation
  tests/
    taskService.test.js        # Service unit tests
    tasks.routes.test.js       # Route integration tests
    tasks.assign.test.js       # Assign endpoint
    coverage.gaps.test.js      # Error handler + validator branches
  jest.config.js
  package.json
ASSIGNMENT.md
```
