const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');
const { validateAssignee } = require('../src/utils/validators');

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const createTask = (body = { title: 'a' }) =>
  request(app)
    .post('/tasks')
    .send(body)
    .then((r) => r.body);

const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

beforeEach(() => {
  taskService._reset();
});

describe('PATCH /tasks/:id/assign — happy path', () => {
  it('returns 200 and the updated task', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'alice' });
  });

  it('persists the assignee', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('alice');
  });

  it('leaves the rest of the task untouched', async () => {
    const task = await createTask({ title: 'a', priority: 'high', status: 'in_progress' });
    const res = await assign(task.id, { assignee: 'alice' });
    expect(res.body).toMatchObject({
      title: 'a',
      priority: 'high',
      status: 'in_progress',
      createdAt: task.createdAt,
    });
  });

  it('defaults assignee to null on a newly created task', async () => {
    const task = await createTask();
    expect(task.assignee).toBeNull();
  });
});

describe('PATCH /tasks/:id/assign — trimming', () => {
  it('trims surrounding whitespace before storing', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '  alice  ' });
    expect(res.body.assignee).toBe('alice');
  });

  it('trims tabs and newlines', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '\t alice \n' });
    expect(res.body.assignee).toBe('alice');
  });

  it('preserves internal whitespace', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '  ada lovelace  ' });
    expect(res.body.assignee).toBe('ada lovelace');
  });

  it('persists the trimmed value, not the raw one', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: '  alice  ' });
    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('alice');
  });
});

describe('PATCH /tasks/:id/assign — reassignment', () => {
  it('overwrites an existing assignee and returns the updated task', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    const res = await assign(task.id, { assignee: 'bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('bob');
  });

  it('persists only the latest assignee', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    await assign(task.id, { assignee: 'bob' });
    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('bob');
  });

  it('can reassign to the same value', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    const res = await assign(task.id, { assignee: 'alice' });
    expect(res.body.assignee).toBe('alice');
  });
});

describe('PATCH /tasks/:id/assign — explicit null unassigns', () => {
  it('clears an existing assignee', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    const res = await assign(task.id, { assignee: null });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  it('persists the unassignment', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    await assign(task.id, { assignee: null });
    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBeNull();
  });

  it('is a no-op on an already-unassigned task', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: null });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  it('allows reassignment after unassigning', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    await assign(task.id, { assignee: null });
    const res = await assign(task.id, { assignee: 'bob' });
    expect(res.body.assignee).toBe('bob');
  });
});

describe('PATCH /tasks/:id/assign — 404', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await assign(UNKNOWN_ID, { assignee: 'alice' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 on an empty store', async () => {
    const res = await assign(UNKNOWN_ID, { assignee: 'alice' });
    expect(res.status).toBe(404);
  });

  it('returns 404 after the task has been deleted', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);
    const res = await assign(task.id, { assignee: 'alice' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/assign — 400', () => {
  it('returns 400 when assignee is missing', async () => {
    const task = await createTask();
    const res = await assign(task.id, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/i);
  });

  it('returns 400 for an empty string', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '' });
    expect(res.status).toBe(400);
  });

  it.each([['   '], ['\t'], ['\n'], ['  \t \n ']])(
    'returns 400 for whitespace-only %j',
    async (assignee) => {
      const task = await createTask();
      const res = await assign(task.id, { assignee });
      expect(res.status).toBe(400);
    }
  );

  it.each([[42], [true], [false], [{ name: 'alice' }], [['alice']]])(
    'returns 400 for non-string %p',
    async (assignee) => {
      const task = await createTask();
      const res = await assign(task.id, { assignee });
      expect(res.status).toBe(400);
    }
  );

  it('does not modify the task on a rejected request', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'alice' });
    await assign(task.id, { assignee: '   ' });
    const res = await request(app).get('/tasks');
    expect(res.body[0].assignee).toBe('alice');
  });

  it('rejects an invalid body before checking the id exists', async () => {
    const res = await assign(UNKNOWN_ID, { assignee: '' });
    expect(res.status).toBe(400);
  });
});

describe('validateAssignee', () => {
  it('accepts a plain string', () => {
    expect(validateAssignee({ assignee: 'alice' })).toBeNull();
  });

  it('accepts a string with surrounding whitespace', () => {
    expect(validateAssignee({ assignee: '  alice  ' })).toBeNull();
  });

  it('accepts an explicit null', () => {
    expect(validateAssignee({ assignee: null })).toBeNull();
  });

  it('rejects a missing key', () => {
    expect(validateAssignee({})).toMatch(/assignee/i);
  });

  it('rejects an explicit undefined', () => {
    expect(validateAssignee({ assignee: undefined })).toMatch(/assignee/i);
  });

  it('rejects an empty string', () => {
    expect(validateAssignee({ assignee: '' })).toMatch(/assignee/i);
  });

  it('rejects a whitespace-only string', () => {
    expect(validateAssignee({ assignee: '   ' })).toMatch(/assignee/i);
  });

  it.each([[42], [true], [{}], [[]]])('rejects non-string %p', (assignee) => {
    expect(validateAssignee({ assignee })).toMatch(/assignee/i);
  });
});

describe('taskService.assign', () => {
  it('returns null for an unknown id', () => {
    expect(taskService.assign(UNKNOWN_ID, 'alice')).toBeNull();
  });

  it('trims before storing', () => {
    const task = taskService.create({ title: 'a' });
    expect(taskService.assign(task.id, '  alice  ').assignee).toBe('alice');
  });

  it('accepts null without throwing', () => {
    const task = taskService.create({ title: 'a' });
    expect(taskService.assign(task.id, null).assignee).toBeNull();
  });
});
