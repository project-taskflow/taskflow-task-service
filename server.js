require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const taskRoutes = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

app.use('/tasks', taskRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'task-service' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Task Service connected to MongoDB');
    app.listen(PORT, () => console.log(`Task Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
