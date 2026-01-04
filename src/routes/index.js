const express = require('express');
const router = express.Router();

const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Controllers
const AuthController = require('../controllers/AuthController');
const BotController = require('../controllers/BotController');
const PlanController = require('../controllers/PlanController');
const CheckoutController = require('../controllers/CheckoutController');
const WebhookController = require('../controllers/WebhookController');
const StatsController = require('../controllers/StatsController');

// ============================================
// PUBLIC ROUTES
// ============================================

// Auth
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);

// Checkout (public - for end users)
router.post('/checkout/link', CheckoutController.generateLink);
router.get('/checkout/status/:subscriptionId', CheckoutController.checkStatus);

// Plans (public - for viewing on creator profile)
router.get('/plans/:id', PlanController.get);

// Public: Get creator profile with bots list
router.get('/plans/public/:username', async (req, res) => {
    try {
        const { User, Bot, Plan } = require('../models');

        // Find user by username
        const user = await User.findOne({
            where: {
                username: req.params.username
            },
            include: [{
                association: 'bots',
                where: { status: 'active' },
                required: false,
                include: [{
                    association: 'plans',
                    where: { status: 'active' },
                    required: false
                }]
            }]
        });

        if (!user) {
            return res.status(404).json({ error: 'Criador não encontrado' });
        }

        // Return bots with their plans count
        const bots = (user.bots || []).map(bot => ({
            id: bot.id,
            username: bot.username,
            name: bot.name,
            plans: bot.plans || []
        }));

        res.json({
            creator: {
                name: user.name,
                username: user.username,
                bio: 'Criador de conteúdo exclusivo'
            },
            bots
        });
    } catch (error) {
        console.error('Error fetching public plans:', error);
        res.status(500).json({ error: 'Erro ao buscar planos' });
    }
});

// Public: Get bot public page with plans
router.get('/bots/public/:botUsername', async (req, res) => {
    try {
        const { Bot, Plan } = require('../models');

        const bot = await Bot.findOne({
            where: {
                username: req.params.botUsername,
                status: 'active'
            },
            include: [{
                association: 'plans',
                where: { status: 'active' },
                required: false
            }]
        });

        if (!bot) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        res.json({
            bot: {
                id: bot.id,
                username: bot.username,
                name: bot.name,
                welcome_message: bot.welcome_message
            },
            plans: bot.plans || []
        });
    } catch (error) {
        console.error('Error fetching bot:', error);
        res.status(500).json({ error: 'Erro ao buscar bot' });
    }
});

// ============================================
// WEBHOOK ROUTES (No auth - called by gateways)
// ============================================

router.post('/webhooks/asaas', WebhookController.handleAsaas);
router.post('/webhooks/mercadopago', WebhookController.handleMercadoPago);
router.post('/webhooks/telegram/:token', WebhookController.handleTelegram);

// Stripe needs raw body, handled separately in app.js

// ============================================
// PROTECTED ROUTES (Require auth)
// ============================================

// Auth protected
router.get('/auth/me', authMiddleware, AuthController.me);
router.put('/auth/gateway', authMiddleware, AuthController.updateGateway);

// Stats
router.get('/stats', authMiddleware, StatsController.getCreatorStats);

// Bots
router.get('/bots', authMiddleware, BotController.list);
router.get('/bots/:id', authMiddleware, BotController.get);
router.post('/bots/connect', authMiddleware, BotController.connect);
router.put('/bots/:id', authMiddleware, BotController.update);
router.delete('/bots/:id', authMiddleware, BotController.delete);

// Plans
router.get('/plans', authMiddleware, PlanController.list);
router.post('/plans', authMiddleware, PlanController.create);
router.put('/plans/:id', authMiddleware, PlanController.update);
router.delete('/plans/:id', authMiddleware, PlanController.delete);

// ============================================
// ADMIN ROUTES
// ============================================

router.get('/admin/stats', authMiddleware, adminMiddleware, StatsController.getAdminStats);

// Admin: List all creators
router.get('/admin/creators', authMiddleware, adminMiddleware, async (req, res) => {
    const { User } = require('../models');
    const creators = await User.findAll({
        where: { role: 'creator' },
        order: [['created_at', 'DESC']]
    });
    res.json({ creators });
});

// Admin: Impersonate (login as creator)
router.post('/admin/impersonate/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    const { User } = require('../models');
    const jwt = require('jsonwebtoken');
    const config = require('../config');

    const user = await User.findByPk(req.params.userId);
    if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const token = jwt.sign(
        { userId: user.id, role: user.role, impersonatedBy: req.userId },
        config.jwt.secret,
        { expiresIn: '1h' }
    );

    res.json({ token, user: user.toJSON() });
});

// Admin: Ban creator
router.post('/admin/creators/:userId/ban', authMiddleware, adminMiddleware, async (req, res) => {
    const { User } = require('../models');

    const user = await User.findByPk(req.params.userId);
    if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await user.update({ status: 'banned' });
    res.json({ message: 'Usuário banido', user: user.toJSON() });
});

module.exports = router;
