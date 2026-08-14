const taskService = require('../src/services/taskService');

const {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  _reset,
} = taskService;

// Helper: seed N tasks with predictable titles.
const seed = (n, overrides = {}) =>
  Array.from({ length: n }, (_, i) => create({ title: `task-${i}`, ...overrides }));

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

beforeEach(() => {
  _reset();
});

describe('_reset', () => {
  it('empties the store', () => {
    seed(3);
    _reset();
    expect(getAll()).toEqual([]);
  });
});

describe('getAll', () => {
  it('returns [] on an empty store', () => {
    expect(getAll()).toEqual([]);
  });

  it('returns every task', () => {
    seed(3);
    expect(getAll()).toHaveLength(3);
  });

  it('returns a copy: pushing to the result does not affect the store', () => {
    seed(1);
    const list = getAll();
    list.push({ id: 'injected' });
    expect(getAll()).toHaveLength(1);
  });

  it('does not expose stored objects by reference', () => {
    const [task] = seed(1);
    getAll()[0].title = 'mutated externally';
    expect(findById(task.id).title).toBe('task-0');
  });
});

describe('findById', () => {
  it('finds an existing task', () => {
    const [task] = seed(1);
    expect(findById(task.id)).toMatchObject({ title: 'task-0' });
  });

  it('returns undefined for an unknown id', () => {
    seed(1);
    expect(findById('no-such-id')).toBeUndefined();
  });

  it('returns undefined on an empty store', () => {
    expect(findById('anything')).toBeUndefined();
  });

  it.each([[null], [undefined], ['']])('returns undefined for invalid id %p', (id) => {
    seed(1);
    expect(findById(id)).toBeUndefined();
  });
});

describe('getByStatus', () => {
  it('returns only exact status matches', () => {
    create({ title: 'a', status: 'todo' });
    create({ title: 'b', status: 'done' });
    const result = getByStatus('done');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('b');
  });

  it('returns [] on an empty store', () => {
    expect(getByStatus('todo')).toEqual([]);
  });

  it('returns [] for a status outside the enum', () => {
    seed(3);
    expect(getByStatus('nonsense')).toEqual([]);
  });

  it('does not substring-match a partial status', () => {
    create({ title: 'a', status: 'todo' });
    create({ title: 'b', status: 'done' });
    expect(getByStatus('do')).toEqual([]);
  });

  it('does not match every task on an empty-string filter', () => {
    seed(3);
    expect(getByStatus('')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => seed(25));

  it('returns the first page for page=1', () => {
    const page = getPaginated(1, 10);
    expect(page).toHaveLength(10);
    expect(page[0].title).toBe('task-0');
  });

  it('returns the second page for page=2', () => {
    const page = getPaginated(2, 10);
    expect(page[0].title).toBe('task-10');
  });

  it('returns a partial final page', () => {
    expect(getPaginated(3, 10)).toHaveLength(5);
  });

  it('returns [] beyond the last page', () => {
    expect(getPaginated(99, 10)).toEqual([]);
  });

  it('does not return a tail slice for page=0', () => {
    const page = getPaginated(0, 10);
    expect(page[0].title).toBe('task-0');
  });

  it('does not read backwards for a negative page', () => {
    expect(getPaginated(-1, 10)).toEqual([]);
  });

  it('does not read backwards for a negative limit', () => {
    expect(getPaginated(1, -5)).toEqual([]);
  });

  it('returns [] for limit=0', () => {
    expect(getPaginated(1, 0)).toEqual([]);
  });

  it('returns [] on an empty store', () => {
    _reset();
    expect(getPaginated(1, 10)).toEqual([]);
  });
});

describe('getStats', () => {
  it('returns zeroed counts on an empty store', () => {
    expect(getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts tasks by status', () => {
    create({ title: 'a', status: 'todo' });
    create({ title: 'b', status: 'in_progress' });
    create({ title: 'c', status: 'done' });
    expect(getStats()).toMatchObject({ todo: 1, in_progress: 1, done: 1 });
  });

  it('ignores tasks with a null dueDate when counting overdue', () => {
    create({ title: 'a', dueDate: null });
    create({ title: 'b' });
    expect(getStats().overdue).toBe(0);
  });

  it('counts a past dueDate as overdue', () => {
    create({ title: 'a', dueDate: daysFromNow(-1) });
    expect(getStats().overdue).toBe(1);
  });

  it('does not count a future dueDate as overdue', () => {
    create({ title: 'a', dueDate: daysFromNow(1) });
    expect(getStats().overdue).toBe(0);
  });

  it('does not count a past dueDate on a done task as overdue', () => {
    create({ title: 'a', status: 'done', dueDate: daysFromNow(-1) });
    expect(getStats().overdue).toBe(0);
  });

  it('does not count a date-only dueDate for today as overdue', () => {
    const today = new Date().toISOString().slice(0, 10);
    create({ title: 'a', dueDate: today });
    expect(getStats().overdue).toBe(0);
  });
});

describe('create', () => {
  it('applies defaults', () => {
    const task = create({ title: 'a' });
    expect(task).toMatchObject({
      title: 'a',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  it('honours supplied fields', () => {
    const task = create({ title: 'a', status: 'done', priority: 'high', description: 'd' });
    expect(task).toMatchObject({ status: 'done', priority: 'high', description: 'd' });
  });

  it('assigns unique ids', () => {
    const ids = seed(5).map((t) => t.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('persists the task to the store', () => {
    const task = create({ title: 'a' });
    expect(findById(task.id)).toBeDefined();
  });

  it('rejects a status outside the enum', () => {
    expect(() => create({ title: 'a', status: 'bogus' })).toThrow();
  });
});

describe('update', () => {
  it('updates supplied fields and leaves others intact', () => {
    const [task] = seed(1);
    const updated = update(task.id, { title: 'renamed' });
    expect(updated).toMatchObject({ title: 'renamed', status: 'todo' });
  });

  it('persists the update', () => {
    const [task] = seed(1);
    update(task.id, { title: 'renamed' });
    expect(findById(task.id).title).toBe('renamed');
  });

  it('returns null for an unknown id', () => {
    expect(update('no-such-id', { title: 'x' })).toBeNull();
  });

  it('returns null on an empty store', () => {
    expect(update('anything', { title: 'x' })).toBeNull();
  });

  it('does not let callers overwrite the id', () => {
    const [task] = seed(1);
    update(task.id, { id: 'hijacked' });
    expect(findById(task.id)).toBeDefined();
  });

  it('does not let callers overwrite createdAt', () => {
    const [task] = seed(1);
    update(task.id, { createdAt: 'not-a-date' });
    expect(Date.parse(findById(task.id).createdAt)).not.toBeNaN();
  });

  it('sets completedAt when status becomes done', () => {
    const [task] = seed(1);
    const updated = update(task.id, { status: 'done' });
    expect(updated.completedAt).not.toBeNull();
  });
});

describe('remove', () => {
  it('removes an existing task and returns true', () => {
    const [task] = seed(1);
    expect(remove(task.id)).toBe(true);
    expect(getAll()).toEqual([]);
  });

  it('returns false for an unknown id', () => {
    seed(1);
    expect(remove('no-such-id')).toBe(false);
    expect(getAll()).toHaveLength(1);
  });

  it('returns false on an empty store', () => {
    expect(remove('anything')).toBe(false);
  });

  it('removes only the targeted task', () => {
    const tasks = seed(3);
    remove(tasks[1].id);
    expect(getAll().map((t) => t.title)).toEqual(['task-0', 'task-2']);
  });
});

describe('completeTask', () => {
  it('sets status to done and stamps completedAt', () => {
    const [task] = seed(1);
    const done = completeTask(task.id);
    expect(done.status).toBe('done');
    expect(Date.parse(done.completedAt)).not.toBeNaN();
  });

  it('persists the completion', () => {
    const [task] = seed(1);
    completeTask(task.id);
    expect(findById(task.id).status).toBe('done');
  });

  it('returns null for an unknown id', () => {
    expect(completeTask('no-such-id')).toBeNull();
  });

  it('returns null on an empty store', () => {
    expect(completeTask('anything')).toBeNull();
  });

  it('preserves the existing priority', () => {
    const task = create({ title: 'a', priority: 'high' });
    expect(completeTask(task.id).priority).toBe('high');
  });
});
