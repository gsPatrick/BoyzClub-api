const { Plan, Bot } = require('../models');

/**
 * Plan Controller
 * Manage subscription plans for bots
 */
class PlanController {
    /**
     * GET /api/plans
     * List all plans for current user's bots
     */
    async list(req, res) {
        try {
            const { botId } = req.query;

            const where = {};
            if (botId) {
                where.bot_id = botId;
            }

            const plans = await Plan.findAll({
                where,
                include: [{
                    association: 'bot',
                    where: { user_id: req.userId },
                    required: true
                }],
                order: [['price', 'ASC']]
            });

            res.json({ plans });
        } catch (error) {
            console.error('[PlanController] List error:', error);
            res.status(500).json({ error: 'Erro ao listar planos' });
        }
    }

    /**
     * GET /api/plans/:id
     * Get single plan
     */
    async get(req, res) {
        try {
            const plan = await Plan.findByPk(req.params.id, {
                include: [{
                    association: 'bot',
                    include: ['owner']
                }]
            });

            if (!plan) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }

            res.json({ plan });
        } catch (error) {
            console.error('[PlanController] Get error:', error);
            res.status(500).json({ error: 'Erro ao buscar plano' });
        }
    }

    /**
     * POST /api/plans
     * Create new plan
     */
    async create(req, res) {
        try {
            const {
                botId, bot_id,
                name,
                description,
                price,
                durationDays, duration_days,
                isRecurring, is_recurring
            } = req.body;

            const actualBotId = botId || bot_id;

            if (!actualBotId) {
                return res.status(400).json({ error: 'Bot ID é obrigatório' });
            }

            // Verify bot ownership
            const bot = await Bot.findOne({
                where: { id: actualBotId, user_id: req.userId }
            });

            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }

            const plan = await Plan.create({
                bot_id: actualBotId,
                name,
                description,
                price,
                duration_days: durationDays || duration_days || 30,
                is_recurring: isRecurring ?? is_recurring ?? true,
                status: 'active'
            });

            res.status(201).json({
                message: 'Plano criado com sucesso',
                plan
            });
        } catch (error) {
            console.error('[PlanController] Create error:', error);
            res.status(500).json({ error: 'Erro ao criar plano' });
        }
    }

    /**
     * PUT /api/plans/:id
     * Update plan
     */
    async update(req, res) {
        try {
            const { name, description, price, durationDays, isRecurring, status } = req.body;

            const plan = await Plan.findByPk(req.params.id, {
                include: [{
                    association: 'bot',
                    where: { user_id: req.userId },
                    required: true
                }]
            });

            if (!plan) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }

            await plan.update({
                name: name ?? plan.name,
                description: description ?? plan.description,
                price: price ?? plan.price,
                duration_days: durationDays ?? plan.duration_days,
                is_recurring: isRecurring ?? plan.is_recurring,
                status: status ?? plan.status
            });

            res.json({
                message: 'Plano atualizado',
                plan
            });
        } catch (error) {
            console.error('[PlanController] Update error:', error);
            res.status(500).json({ error: 'Erro ao atualizar plano' });
        }
    }

    /**
     * DELETE /api/plans/:id
     * Delete plan
     */
    async delete(req, res) {
        try {
            const plan = await Plan.findByPk(req.params.id, {
                include: [{
                    association: 'bot',
                    where: { user_id: req.userId },
                    required: true
                }]
            });

            if (!plan) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }

            // Soft delete - just mark as inactive
            await plan.update({ status: 'inactive' });

            res.json({ message: 'Plano removido' });
        } catch (error) {
            console.error('[PlanController] Delete error:', error);
            res.status(500).json({ error: 'Erro ao remover plano' });
        }
    }
}

module.exports = new PlanController();
