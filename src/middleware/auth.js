const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Authentication Middleware
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Token mal formatado' });
    }

    const token = parts[1];

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

/**
 * Admin Only Middleware
 */
function adminMiddleware(req, res, next) {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
}

module.exports = { authMiddleware, adminMiddleware };
