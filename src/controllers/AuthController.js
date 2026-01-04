const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');

/**
 * Authentication Controller
 */
class AuthController {
    /**
     * POST /api/auth/register
     * Register new creator
     */
    async register(req, res) {
        try {
            const { name, email, password, pixKey } = req.body;

            // Check if email exists
            const existing = await User.findOne({ where: { email } });
            if (existing) {
                return res.status(400).json({ error: 'Email já cadastrado' });
            }

            // Create user
            const user = await User.create({
                name,
                email,
                password_hash: password,
                pix_key: pixKey,
                role: 'creator',
                webhook_url: null // Will be generated after creation
            });

            // Generate webhook URL
            const webhookUrl = `${config.urls.api}/api/webhooks/creator/${user.id}`;
            await user.update({ webhook_url: webhookUrl });

            // Generate JWT
            const token = jwt.sign(
                { userId: user.id, role: user.role },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            res.status(201).json({
                message: 'Conta criada com sucesso',
                user: user.toJSON(),
                token
            });
        } catch (error) {
            console.error('[AuthController] Register error:', error);
            res.status(500).json({ error: 'Erro ao criar conta' });
        }
    }

    /**
     * POST /api/auth/login
     * Login user
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Find user
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(401).json({ error: 'Email ou senha incorretos' });
            }

            // Validate password
            const isValid = await user.validatePassword(password);
            if (!isValid) {
                return res.status(401).json({ error: 'Email ou senha incorretos' });
            }

            // Check if banned
            if (user.status === 'banned') {
                return res.status(403).json({ error: 'Conta suspensa' });
            }

            // Generate JWT
            const token = jwt.sign(
                { userId: user.id, role: user.role },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            res.json({
                user: user.toJSON(),
                token
            });
        } catch (error) {
            console.error('[AuthController] Login error:', error);
            res.status(500).json({ error: 'Erro ao fazer login' });
        }
    }

    /**
     * GET /api/auth/me
     * Get current user
     */
    async me(req, res) {
        try {
            const user = await User.findByPk(req.userId, {
                include: [{
                    association: 'bots',
                    include: ['plans']
                }]
            });

            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            res.json({ user: user.toJSON() });
        } catch (error) {
            console.error('[AuthController] Me error:', error);
            res.status(500).json({ error: 'Erro ao buscar usuário' });
        }
    }

    /**
     * PUT /api/auth/gateway
     * Update gateway configuration
     */
    async updateGateway(req, res) {
        try {
            const { gateway, apiToken } = req.body;

            const user = await User.findByPk(req.userId);
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            await user.update({
                gateway_preference: gateway,
                gateway_api_token: apiToken
            });

            res.json({
                message: 'Gateway atualizado com sucesso',
                gateway: user.gateway_preference
            });
        } catch (error) {
            console.error('[AuthController] Update gateway error:', error);
            res.status(500).json({ error: 'Erro ao atualizar gateway' });
        }
    }
}

module.exports = new AuthController();
