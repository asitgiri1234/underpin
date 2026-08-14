const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');
const { validateUpdateTask } = require('../src/utils/validators');

beforeEach(() => {
  taskService._reset();
});

// app.js:9-12 — the global error middleware, unreached by any well-formed request.
describe('error handler', () => {
  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": broken}');
    expect(res.status).toBe(400);
  });

  it('returns a JSON error payload rather than an HTML stack page', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": broken}');
    expect(res.body).toHaveProperty('error');
  });
});

// routes/tasks.js:21 — the `|| 10` limit fallback when only `page` is supplied.
describe('pagination defaults', () => {
  beforeEach(async () => {
    for (let i = 0; i < 25; i++) {
      await request(app).post('/tasks').send({ title: `task-${i}` });
    }
  });

  it('defaults limit to 10 when only page is supplied', async () => {
    const res = await request(app).get('/tasks?page=2');
    expect(res.body).toHaveLength(10);
  });

  it('does not 500 on a non-numeric page', async () => {
    const res = await request(app).get('/tasks?page=abc&limit=10');
    expect(res.status).toBe(200);
  });
});

// validators.js:24-25 and 30-31 — update-path status and dueDate branches.
describe('validateUpdateTask uncovered branches', () => {
  it('rejects a status outside the enum', () => {
    expect(validateUpdateTask({ status: 'pending' })).toMatch(/status/i);
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'not-a-date' })).toMatch(/dueDate/i);
  });

  it('accepts an update with no fields at all', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  it('surfaces the status error through PUT', async () => {
    const { body: task } = await request(app).post('/tasks').send({ title: 'a' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'pending' });
    expect(res.status).toBe(400);
  });

  it('surfaces the dueDate error through PUT', async () => {
    const { body: task } = await request(app).post('/tasks').send({ title: 'a' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
