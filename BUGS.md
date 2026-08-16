# Bug Report

## Summary

I understand this app as a simple Task Manager API where tasks are stored in an array. The main problem is that the service does not properly protect or validate the data.

The largest group of the 9 bugs shares one root cause: the service trusts incoming data and hands out direct references to its stored objects. That covers four of them — reading tasks hands back the stored objects themselves, and create, id and createdAt all let unchecked input straight into the store. The other five do not fit that pattern — the status filter uses the wrong comparison operator, the overdue check compares a date with no time against an exact moment, update never records completedAt when a task becomes done, completeTask contains a stray hardcoded line, and the error handler sits in a different layer (app.js) entirely.

Because of this:
- Reading can accidentally change tasks.
- Status filtering is incorrect.
- Overdue dates are calculated wrongly.
- Stats can become inaccurate.
- id and createdAt can be changed.
- completedAt is not always updated correctly.
- Completing a task can destroy its priority.
- Bad JSON is reported as a server error instead of 400.

So basically, the app needs stronger validation and better protection of its stored data.

---

## Bug 1: Reading tasks hands out the stored objects

**Location:** task-api/src/services/taskService.js:5

**Failing test:** `getAll › does not expose stored objects by reference`

**Expected:** Reading the task list should give the caller a view they cannot accidentally write back into the store.

**Actual:** After `create({title: 'original'})`, assigning `getAll()[0].title = 'HACKED'` changes the stored task, and `findById(id).title` then returns `"HACKED"`.

**How I found it:** A unit test that read the list, edited the returned object, and then asked the store for the same task again.

**Why it happens:** The spread in `[...tasks]` builds a new array, but it copies the references inside it rather than the task objects themselves. That protects the caller from adding or removing entries, and protects nothing about the contents. Every task the caller receives is the same object the store is still using.

**Suggested fix:** Return a copy of each task rather than a copy of the array, for example by mapping over the list and spreading each task.

---

## Bug 2: The status filter matches on partial text

**Location:** task-api/src/services/taskService.js:9

**Failing test:** `getByStatus › does not substring-match a partial status` (also `getByStatus › does not match every task on an empty-string filter`)

**Expected:** Filtering by status should return only the tasks whose status is exactly the requested one.

**Actual:** With one `todo` task and one `done` task in the store, `getByStatus('do')` returns both of them, and `getByStatus('')` also returns both.

**How I found it:** A unit test that filtered on a partial string that is not a real status, and a second one that filtered on an empty string.

**Why it happens:** The filter calls `includes` on the status string, which asks whether the status contains the given text rather than whether it equals it. Status is a fixed set of values, so containment is never the right question. The values also overlap as text, since both `todo` and `done` contain the letters `do`, and every string contains the empty string.

**Suggested fix:** Compare with `===` instead of calling `includes`.

---

## Bug 3: A due date with no time is treated as the start of the day in UTC

**Location:** task-api/src/services/taskService.js:24

**Failing test:** `getStats › does not count a date-only dueDate for today as overdue`

**Expected:** A task due today should not count as overdue until the day has actually ended.

**Actual:** On 15 August 2026, creating a task with `dueDate: '2026-08-15'` and calling `getStats()` returns `overdue: 1`, even though the task is due that same day.

**How I found it:** A unit test that created a task due today and then checked the overdue count in the stats.

**Why it happens:** A date written without a time, such as `2026-08-15`, is parsed as midnight UTC, while `now` is the real current moment. A due date really means the end of that day, but the code pins it to the first instant of the day in a fixed zone, so the comparison turns true long before the day is over. How early depends on the server's timezone, which makes the bug behave differently on different machines.

**Suggested fix:** Compare against the end of the due date's day in the server's local timezone rather than against the raw parsed value.

**Timezone note:** This bug is timezone dependent. On a machine set to India Standard Time, which is UTC plus five and a half hours, `2026-08-15` is parsed as 5:30am local time, so a task due today starts reporting as overdue from 5:30am and stays wrong for the remaining eighteen and a half hours of the day. On timezones behind UTC the task reads as overdue for the whole local day. A server running in UTC exactly is the only case that behaves correctly, and only at midnight.

---

## Bug 4: Creating a task validates nothing

**Location:** task-api/src/services/taskService.js:32

**Failing test:** `create › rejects a status outside the enum`

**Expected:** The service should refuse to store a task whose status or priority is not one of the allowed values.

**Actual:** `create({title: 'a', status: 'banana', priority: 'urgent'})` succeeds and stores the task exactly as given.

**How I found it:** A unit test that called the service directly with a status that is not in the allowed list and expected it to be rejected.

**Why it happens:** The function destructures its argument to supply defaults for missing fields, but it never checks the values that are present. All the validation lives in `validators.js`, and only the route layer calls it. That means the rule is enforced for HTTP requests but not for anything else that uses the service, such as a seed script or a background job.

**Suggested fix:** Call the existing validator inside `create` so the rule holds no matter who calls it.

---

## Bug 5: The id of a task can be overwritten

**Location:** task-api/src/services/taskService.js:52

**Failing test:** `update › does not let callers overwrite the id`

**Expected:** Updating a task should change its editable fields and leave its id alone.

**Actual:** After `update(id, {id: 'hijacked'})`, looking the task up by its original id returns `undefined`, and the store now holds a task whose id is `"hijacked"`.

**How I found it:** A unit test that updated a task with an `id` field in the body and then tried to fetch it by its original id.

**Why it happens:** The update merges the caller's fields into the stored task with a spread, and it accepts whatever keys arrive without checking them against a list of fields that are allowed to change. The id is the only value the store uses to find a task. Overwriting it does not edit the record so much as make it unreachable.

**Suggested fix:** Merge only an explicit list of editable fields, or set the id back after the merge.

---

## Bug 6: The createdAt timestamp can be overwritten

**Location:** task-api/src/services/taskService.js:52

**Failing test:** `update › does not let callers overwrite createdAt`

**Expected:** The creation timestamp is set once by the server and should not be changeable afterwards.

**Actual:** After `update(id, {createdAt: 'not-a-date'})`, the stored `createdAt` is the literal string `"not-a-date"`.

**How I found it:** A unit test that updated a task with a `createdAt` field containing text that is not a date, and then read the timestamp back.

**Why it happens:** This is the same unrestricted merge as the previous bug, applied to a different field. `createdAt` is a record the server keeps about itself rather than data the client owns, so it should be written once at creation and then left alone. Nothing checks afterwards that the value is still a real date, so anything downstream that sorts by age or parses the timestamp now silently gets an invalid value.

**Suggested fix:** Keep `createdAt` out of the fields an update is allowed to touch.

---

## Bug 7: Setting a task to done through update does not record when it was done

**Location:** task-api/src/services/taskService.js:52

**Failing test:** `update › sets completedAt when status becomes done`

**Expected:** Whenever a task moves into the done state, the time it was completed should be recorded.

**Actual:** `update(id, {status: 'done'})` returns a task with `status` set to `"done"` and `completedAt` still `null`.

**How I found it:** A unit test that set the status to done through the update function and then checked the completion timestamp.

**Why it happens:** The update is a plain merge of whatever fields it was given, so it has no idea that moving to done is a state change with a consequence. The `completeTask` function does handle that consequence, which means there are two ways to finish a task and only one of them fills in the timestamp. As a result `completedAt` cannot be relied on to tell whether a task is done, and the two paths disagree about the same record.

**Suggested fix:** Set `completedAt` inside the update whenever the status is changing to done, so both paths behave the same way.

---

## Bug 8: Completing a task wipes out its priority

**Location:** task-api/src/services/taskService.js:71

**Failing test:** `completeTask › preserves the existing priority` (also `PATCH /tasks/:id/complete › preserves the existing priority`)

**Expected:** Completing a task should change its status and completion time and leave everything else as it was.

**Actual:** After `create({title: 'a', priority: 'high'})`, calling `completeTask(id)` returns a task whose priority is `"medium"`, and the same happens through `PATCH /tasks/:id/complete`.

**How I found it:** A unit test that created a high priority task, completed it, and checked the priority afterwards, plus a matching route test through the API.

**Why it happens:** The function copies the existing task with a spread and then sets `priority` to `'medium'` on the very next line, which overwrites whatever the task had. Finishing a task says nothing about how important it was, so that line does not belong in this function at all. It reads like a default that was copied across from the create function into a path that only meant to change the status and the timestamp.

**Suggested fix:** Delete the `priority: 'medium'` line so the existing value carries through the spread.

---

## Bug 9: Malformed JSON is reported as a server error

**Location:** task-api/src/app.js:11

**Failing test:** `error handler › returns 400 for a malformed JSON body`

**Expected:** A request whose body is not valid JSON is a client mistake and should come back as 400.

**Actual:** Sending `POST /tasks` with a JSON content type and the body `{"title": broken}` returns `500` with `{"error":"Internal server error"}`.

**How I found it:** A route test that posted a deliberately malformed JSON body and checked the status code.

**Why it happens:** The error handler responds with a hardcoded 500 and ignores the status carried on the error it was given. The JSON body parser already recognises this case and raises an error marked as a 400, and that information is thrown away here. The difference matters to clients, because 400 means the request itself was wrong and retrying it unchanged will never work, while 500 invites a retry.

**Suggested fix:** Use the status from the error when it has one and fall back to 500 only when it does not.
