const authenticate = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];
  const userRole = req.headers['x-user-role'];

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing user context' });
  }

  req.user = { id: userId, email: userEmail, role: userRole };
  next();
};

module.exports = { authenticate };
