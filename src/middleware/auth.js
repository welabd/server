// Authentication disabled — app opens directly without login
const authenticate = (req, res, next) => next();
const isAdmin = (req, res, next) => next();
module.exports = { authenticate, isAdmin };
