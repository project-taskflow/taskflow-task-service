const express = require('express');
const { body, query, validationResult } = require('express-validator');
const axios = require('axios');
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004';

// Fire-and-forget: does not block task operations if notification service is down
async function notify(userId, type, title, message, metadata = {}) {
  try {
    await axios.post(`${NOTIFICATION_URL}/notifications/internal`, { userId, type, title, message, metadata }, { timeout: 2000 });
  } catch (_) { /* intentionally silent */ }
}

// GET /tasks — list tasks for the authenticated user
router.get(
  '/',
  authenticate,
  [
    query('status').optional().isIn(['todo', 'in-progress', 'done']),
    query('priority').optional().isIn(['low', 'medium', 'high']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const filter = { userId: req.user.id };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.priority) filter.priority = req.query.priority;

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, parseInt(req.query.limit) || 20);
      const skip = (page - 1) * limit;

      const [tasks, total] = await Promise.all([
        Task.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
        Task.countDocuments(filter),
      ]);

      res.json({ tasks, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
      console.error('List tasks error:', err);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }
);

// GET /tasks/stats — task statistics for the authenticated user
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await Task.aggregate([
      { $match: { userId: req.user.id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const result = { todo: 0, 'in-progress': 0, done: 0, total: 0 };
    stats.forEach(({ _id, count }) => {
      result[_id] = count;
      result.total += count;
    });

    res.json(result);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /tasks/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /tasks
router.post(
  '/',
  authenticate,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('status').optional().isIn(['todo', 'in-progress', 'done']),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('dueDate').optional().isISO8601().withMessage('Invalid date format'),
    body('tags').optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const task = await Task.create({ ...req.body, userId: req.user.id });
      notify(req.user.id, 'task_created', 'Task Created', `"${task.title}" has been added to your board.`, { taskId: task._id.toString(), taskTitle: task.title });
      res.status(201).json({ message: 'Task created', task });
    } catch (err) {
      console.error('Create task error:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// PUT /tasks/:id
router.put(
  '/:id',
  authenticate,
  [
    body('title').optional().trim().notEmpty(),
    body('status').optional().isIn(['todo', 'in-progress', 'done']),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('dueDate').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'tags'];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => allowed.includes(k))
      );

      const task = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (updates.status === 'done') {
        notify(req.user.id, 'task_completed', 'Task Completed! 🎉', `"${task.title}" has been marked as done.`, { taskId: task._id.toString(), taskTitle: task.title });
      }
      res.json({ message: 'Task updated', task });
    } catch (err) {
      console.error('Update task error:', err);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }
);

// DELETE /tasks/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
