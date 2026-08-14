const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const post = (body) => request(app).post('/tasks').send(body);

const seed = (n) =>
  Promise.all(Array.from({ length: n }, (_, i) => post({ title: `task-${i}` }).then((r) => r.body)));

beforeEach(() => {
  taskService._reset();
});

describe('GET /tasks', () => {
  it('returns 200 and an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and every task', async () => {
    await seed(3);
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('filters by status', async () => {
    await post({ title: 'a', status: 'todo' });
    await post({ title: 'b', status: 'done' });
    const res = await request(app).get('/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('b');
  });
});

describe('GET /tasks pagination', () => {
  beforeEach(async () => {
    await seed(25);
  });

  it('returns the first page for page=1', async () => {
    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0].title).toBe('task-0');
  });

  it('returns the second page for page=2', async () => {
    const res = await request(app).get('/tasks?page=2&limit=10');
    expect(res.body[0].title).toBe('task-10');
  });

  it('returns a partial final page', async () => {
    const res = await request(app).get('/tasks?page=3&limit=10');
    expect(res.body).toHaveLength(5);
  });

  it('returns an empty page beyond the last', async () => {
    const res = await request(app).get('/tasks?page=99&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('applies limit on its own', async () => {
    const res = await request(app).get('/tasks?limit=5');
    expect(res.body).toHaveLength(5);
  });
});

describe('POST /tasks', () => {
  it('returns 201 and the created task', async () => {
    const res = await post({ title: 'write tests' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'write tests',
      status: 'todo',
      priority: 'medium',
      completedAt: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('honours supplied fields', async () => {
    const res = await post({ title: 'a', status: 'in_progress', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'in_progress', priority: 'high' });
  });

  it('returns 400 when title is missing', async () => {
    const res = await post({ description: 'no title' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 when title is blank', async () => {
    const res = await post({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid priority', async () => {
    const res = await post({ title: 'a', priority: 'urgent' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await post({ title: 'a', status: 'pending' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('returns 400 for an invalid dueDate', async () => {
    const res = await post({ title: 'a', dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /tasks/:id', () => {
  it('returns 200 and the updated task', async () => {
    const { body: task } = await post({ title: 'before' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'after' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'after' });
  });

  it('persists the update', async () => {
    const { body: task } = await post({ title: 'before' });
    await request(app).put(`/tasks/${task.id}`).send({ status: 'in_progress' });
    const res = await request(app).get('/tasks');
    expect(res.body[0].status).toBe('in_progress');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put(`/tasks/${UNKNOWN_ID}`).send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 for an invalid priority', async () => {
    const { body: task } = await post({ title: 'a' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a blank title', async () => {
    const { body: task } = await post({ title: 'a' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns 204 with an empty body', async () => {
    const { body: task } = await post({ title: 'a' });
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('actually removes the task', async () => {
    const { body: task } = await post({ title: 'a' });
    await request(app).delete(`/tasks/${task.id}`);
    const res = await request(app).get('/tasks');
    expect(res.body).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete(`/tasks/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting the same task twice', async () => {
    const { body: task } = await post({ title: 'a' });
    await request(app).delete(`/tasks/${task.id}`);
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('returns 200 with status done and a completedAt stamp', async () => {
    const { body: task } = await post({ title: 'a' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  it('persists the completion', async () => {
    const { body: task } = await post({ title: 'a' });
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app).get('/tasks');
    expect(res.body[0].status).toBe('done');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch(`/tasks/${UNKNOWN_ID}/complete`);
    expect(res.status).toBe(404);
  });

  it('preserves the existing priority', async () => {
    const { body: task } = await post({ title: 'a', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('high');
  });
});

describe('GET /tasks/stats', () => {
  it('returns 200 with zeroed counts on an empty store', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts tasks by status', async () => {
    await post({ title: 'a', status: 'todo' });
    await post({ title: 'b', status: 'in_progress' });
    await post({ title: 'c', status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toMatchObject({ todo: 1, in_progress: 1, done: 1 });
  });

  it('counts an overdue task', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await post({ title: 'a', dueDate: past });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });

  it('is not shadowed by a task whose id is "stats"', async () => {
    await seed(2);
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overdue');
  });
});
