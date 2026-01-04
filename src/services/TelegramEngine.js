const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { Bot, Plan, Subscription, Transaction, User } = require('../models');
const { Op } = require('sequelize');
const config = require('../config');

/**
 * Telegram Multi-Tenant VIP Bot Engine
 * Complete VIP bot with all features
 */
class TelegramEngine {
    constructor() {
        this.bots = new Map(); // botId -> Telegraf instance
        this.tokenToBot = new Map(); // token -> botId
    }

    /**
     * Initialize all active bots from database
     */
    async initialize() {
        try {
            const activeBots = await Bot.findAll({
                where: { status: 'active' },
                include: [{ association: 'plans', where: { status: 'active' }, required: false }]
            });

            console.log(`[TelegramEngine] Found ${activeBots.length} active bots`);

            for (const bot of activeBots) {
                await this.registerBot(bot);
            }
        } catch (error) {
            console.error('[TelegramEngine] Error initializing:', error);
        }
    }

    /**
     * Validate bot token with Telegram API
     */
    async validateToken(token) {
        try {
            const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
            if (response.data.ok) {
                return response.data.result;
            }
            return null;
        } catch (error) {
            console.error('[TelegramEngine] Invalid token:', error.message);
            return null;
        }
    }

    /**
     * Register and start a bot
     */
    async registerBot(botRecord) {
        try {
            // Validate token first
            const botInfo = await this.validateToken(botRecord.token);
            if (!botInfo) {
                await botRecord.update({ status: 'error', last_error: 'Invalid token' });
                return null;
            }

            // Create Telegraf instance
            const telegrafBot = new Telegraf(botRecord.token);

            // Setup handlers
            this.setupHandlers(telegrafBot, botRecord);

            // Set webhook
            const webhookUrl = `${config.telegram.webhookBaseUrl}/${botRecord.token}`;

            try {
                await telegrafBot.telegram.setWebhook(webhookUrl);
                await botRecord.update({
                    username: botInfo.username,
                    name: botRecord.name || botInfo.first_name,
                    webhook_set: true,
                    status: 'active',
                    last_error: null
                });
            } catch (webhookError) {
                // Fallback to polling in development
                if (config.env === 'development') {
                    console.log(`[TelegramEngine] Using polling for bot ${botInfo.username}`);
                    telegrafBot.launch({ dropPendingUpdates: true });
                }
            }

            // Store instance
            this.bots.set(botRecord.id, telegrafBot);
            this.tokenToBot.set(botRecord.token, botRecord.id);

            console.log(`[TelegramEngine] Bot @${botInfo.username} registered`);
            return botInfo;
        } catch (error) {
            console.error(`[TelegramEngine] Error registering bot:`, error);
            await botRecord.update({ status: 'error', last_error: error.message });
            return null;
        }
    }

    /**
     * Setup all bot handlers - Complete VIP Bot
     */
    setupHandlers(telegrafBot, botRecord) {
        const self = this;

        // ===================================================================
        // /start - Main entry point & deeplink handler
        // ===================================================================
        telegrafBot.command('start', async (ctx) => {
            const telegramUser = ctx.from;
            const firstName = telegramUser.first_name || 'Usuário';
            const startPayload = ctx.message.text.split(' ')[1];

            // Get plans for this bot
            const plans = await Plan.findAll({
                where: { bot_id: botRecord.id, status: 'active' },
                order: [['price', 'ASC']]
            });

            // Check for deeplink with plan ID
            if (startPayload && startPayload.startsWith('plan_')) {
                const planId = startPayload.replace('plan_', '');
                const selectedPlan = plans.find(p => p.id === planId);
                if (selectedPlan) {
                    return self.showPaymentOptions(ctx, selectedPlan, botRecord, telegramUser);
                }
            }

            // Check if user has active subscription
            const existingSub = await self.getUserActiveSubscription(telegramUser.id, botRecord.id);

            if (existingSub) {
                return self.showMemberMenu(ctx, existingSub, botRecord, firstName);
            }

            // Show welcome & plans for new users
            return self.showWelcomeWithPlans(ctx, plans, botRecord, firstName);
        });

        // ===================================================================
        // /planos - Show available plans
        // ===================================================================
        telegrafBot.command('planos', async (ctx) => {
            const plans = await Plan.findAll({
                where: { bot_id: botRecord.id, status: 'active' },
                order: [['price', 'ASC']]
            });

            if (plans.length === 0) {
                return ctx.reply('❌ Nenhum plano disponível no momento.');
            }

            const buttons = plans.map(plan => {
                const duration = plan.duration_days === 0 ? 'Vitalício' : `${plan.duration_days} dias`;
                const price = `R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}`;
                return [Markup.button.callback(`${plan.name} - ${price} (${duration})`, `plan_${plan.id}`)];
            });

            await ctx.reply(
                `📋 *Planos Disponíveis*\n\n` +
                `Escolha o plano que deseja assinar:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                }
            );
        });

        // ===================================================================
        // /status - Check subscription status
        // ===================================================================
        telegrafBot.command('status', async (ctx) => {
            const telegramUser = ctx.from;
            const subscription = await self.getUserActiveSubscription(telegramUser.id, botRecord.id);

            if (!subscription) {
                return ctx.reply(
                    '❌ *Sem Assinatura Ativa*\n\n' +
                    'Você não possui uma assinatura ativa neste bot.\n\n' +
                    'Use /planos para ver os planos disponíveis.',
                    { parse_mode: 'Markdown' }
                );
            }

            const plan = subscription.plan;
            const expiresAt = subscription.expires_at
                ? new Date(subscription.expires_at).toLocaleDateString('pt-BR')
                : 'Nunca (Vitalício)';
            const daysLeft = subscription.expires_at
                ? Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
                : '∞';

            await ctx.reply(
                `✅ *Sua Assinatura*\n\n` +
                `📦 Plano: *${plan?.name || 'N/A'}*\n` +
                `📅 Válido até: ${expiresAt}\n` +
                `⏰ Dias restantes: ${daysLeft}\n` +
                `🔄 Status: Ativo\n\n` +
                `Use /ajuda para ver todos os comandos.`,
                { parse_mode: 'Markdown' }
            );
        });

        // ===================================================================
        // /renovar - Renew subscription
        // ===================================================================
        telegrafBot.command('renovar', async (ctx) => {
            const telegramUser = ctx.from;

            // Get last subscription (active or expired)
            const lastSub = await Subscription.findOne({
                where: { user_telegram_id: telegramUser.id },
                include: [{
                    association: 'plan',
                    where: { bot_id: botRecord.id }
                }],
                order: [['created_at', 'DESC']]
            });

            if (!lastSub || !lastSub.plan) {
                return ctx.reply(
                    '❌ Você não tem assinatura anterior.\n\n' +
                    'Use /planos para ver os planos disponíveis.'
                );
            }

            // Show renewal option
            await self.showPaymentOptions(ctx, lastSub.plan, botRecord, telegramUser);
        });

        // ===================================================================
        // /cancelar - Cancel subscription info
        // ===================================================================
        telegrafBot.command('cancelar', async (ctx) => {
            const telegramUser = ctx.from;
            const subscription = await self.getUserActiveSubscription(telegramUser.id, botRecord.id);

            if (!subscription) {
                return ctx.reply('❌ Você não possui assinatura ativa para cancelar.');
            }

            await ctx.reply(
                `⚠️ *Cancelar Assinatura*\n\n` +
                `Você realmente deseja cancelar sua assinatura?\n\n` +
                `• Seu acesso ao grupo VIP será removido\n` +
                `• O cancelamento é imediato\n` +
                `• Não há reembolso`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ Sim, Cancelar', `cancel_confirm_${subscription.id}`)],
                        [Markup.button.callback('✅ Não, Manter', 'cancel_abort')]
                    ])
                }
            );
        });

        // ===================================================================
        // /grupo - Get VIP group access link
        // ===================================================================
        telegrafBot.command('grupo', async (ctx) => {
            const telegramUser = ctx.from;
            const subscription = await self.getUserActiveSubscription(telegramUser.id, botRecord.id);

            if (!subscription) {
                return ctx.reply(
                    '❌ *Acesso Negado*\n\n' +
                    'Você precisa ter uma assinatura ativa para acessar o grupo VIP.\n\n' +
                    'Use /planos para ver os planos disponíveis.',
                    { parse_mode: 'Markdown' }
                );
            }

            if (!botRecord.channel_id) {
                return ctx.reply('⚠️ O grupo VIP ainda não foi configurado. Entre em contato com o administrador.');
            }

            try {
                // Generate invite link
                const inviteLink = await ctx.telegram.createChatInviteLink(
                    botRecord.channel_id,
                    {
                        member_limit: 1,
                        expire_date: Math.floor(Date.now() / 1000) + 3600 // 1 hour
                    }
                );

                await ctx.reply(
                    `🎉 *Acesso VIP Liberado!*\n\n` +
                    `Clique no link abaixo para entrar no grupo:\n\n` +
                    `🔗 ${inviteLink.invite_link}\n\n` +
                    `⚠️ Este link expira em 1 hora e é de uso único.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('[TelegramEngine] Error creating invite link:', error);
                await ctx.reply('❌ Erro ao gerar link do grupo. Tente novamente ou contate o suporte.');
            }
        });

        // ===================================================================
        // /ajuda - Help menu
        // ===================================================================
        telegrafBot.command('ajuda', async (ctx) => {
            await ctx.reply(
                `📖 *Comandos Disponíveis*\n\n` +
                `🏠 /start - Menu principal\n` +
                `📋 /planos - Ver planos disponíveis\n` +
                `✅ /status - Ver status da assinatura\n` +
                `🔗 /grupo - Acessar grupo VIP\n` +
                `🔄 /renovar - Renovar assinatura\n` +
                `❌ /cancelar - Cancelar assinatura\n` +
                `📖 /ajuda - Esta mensagem\n` +
                `💬 /suporte - Falar com suporte\n\n` +
                `_Se precisar de ajuda, use /suporte_`,
                { parse_mode: 'Markdown' }
            );
        });

        // ===================================================================
        // /suporte - Contact support
        // ===================================================================
        telegrafBot.command('suporte', async (ctx) => {
            // Get creator info
            const bot = await Bot.findByPk(botRecord.id, { include: ['owner'] });
            const creatorName = bot?.owner?.name || 'Administrador';

            await ctx.reply(
                `💬 *Suporte*\n\n` +
                `Para falar com o suporte, envie uma mensagem descrevendo seu problema.\n\n` +
                `📧 Responsável: ${creatorName}\n\n` +
                `_Sua mensagem será encaminhada para a equipe de suporte._`,
                { parse_mode: 'Markdown' }
            );
        });

        // ===================================================================
        // Plan selection callback
        // ===================================================================
        telegrafBot.action(/plan_(.+)/, async (ctx) => {
            const planId = ctx.match[1];
            const plan = await Plan.findByPk(planId, {
                include: [{ association: 'bot', include: ['owner'] }]
            });

            if (!plan) {
                return ctx.answerCbQuery('Plano não encontrado');
            }

            await ctx.answerCbQuery();
            await self.showPaymentOptions(ctx, plan, botRecord, ctx.from, true);
        });

        // ===================================================================
        // Cancel subscription callbacks
        // ===================================================================
        telegrafBot.action(/cancel_confirm_(.+)/, async (ctx) => {
            const subscriptionId = ctx.match[1];

            try {
                const subscription = await Subscription.findByPk(subscriptionId, {
                    include: ['plan']
                });

                if (!subscription || subscription.user_telegram_id !== ctx.from.id.toString()) {
                    return ctx.answerCbQuery('Assinatura não encontrada');
                }

                // Cancel subscription
                await subscription.update({ status: 'cancelled' });

                // Remove from group if configured
                if (botRecord.channel_id) {
                    try {
                        await ctx.telegram.banChatMember(botRecord.channel_id, ctx.from.id);
                        await ctx.telegram.unbanChatMember(botRecord.channel_id, ctx.from.id);
                    } catch (e) {
                        console.error('[TelegramEngine] Error removing from group:', e);
                    }
                }

                await ctx.answerCbQuery('Assinatura cancelada');
                await ctx.editMessageText(
                    '✅ Sua assinatura foi cancelada com sucesso.\n\n' +
                    'Se mudar de ideia, use /planos para assinar novamente.',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('[TelegramEngine] Cancel error:', error);
                await ctx.answerCbQuery('Erro ao cancelar');
            }
        });

        telegrafBot.action('cancel_abort', async (ctx) => {
            await ctx.answerCbQuery('Cancelamento abortado');
            await ctx.editMessageText('✅ Sua assinatura foi mantida. Obrigado por continuar conosco!');
        });

        // ===================================================================
        // Back to plans callback
        // ===================================================================
        telegrafBot.action('back_to_plans', async (ctx) => {
            await ctx.answerCbQuery();

            const plans = await Plan.findAll({
                where: { bot_id: botRecord.id, status: 'active' },
                order: [['price', 'ASC']]
            });

            const buttons = plans.map(plan => {
                const duration = plan.duration_days === 0 ? 'Vitalício' : `${plan.duration_days} dias`;
                const price = `R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}`;
                return [Markup.button.callback(`${plan.name} - ${price} (${duration})`, `plan_${plan.id}`)];
            });

            await ctx.editMessageText(
                `📋 *Escolha seu plano:*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                }
            );
        });

        // ===================================================================
        // Main menu callback
        // ===================================================================
        telegrafBot.action('main_menu', async (ctx) => {
            await ctx.answerCbQuery();
            const subscription = await self.getUserActiveSubscription(ctx.from.id, botRecord.id);

            if (subscription) {
                await self.showMemberMenu(ctx, subscription, botRecord, ctx.from.first_name || 'Membro', true);
            } else {
                const plans = await Plan.findAll({
                    where: { bot_id: botRecord.id, status: 'active' },
                    order: [['price', 'ASC']]
                });
                await self.showWelcomeWithPlans(ctx, plans, botRecord, ctx.from.first_name || 'Usuário', true);
            }
        });

        // Error handler
        telegrafBot.catch((err, ctx) => {
            console.error(`[TelegramEngine] Error for bot ${botRecord.id}:`, err);
        });
    }

    // ===================================================================
    // Helper Methods
    // ===================================================================

    /**
     * Get user's active subscription for a bot
     */
    async getUserActiveSubscription(telegramId, botId) {
        const plans = await Plan.findAll({
            where: { bot_id: botId },
            attributes: ['id']
        });
        const planIds = plans.map(p => p.id);

        if (planIds.length === 0) return null;

        const subscription = await Subscription.findOne({
            where: {
                user_telegram_id: telegramId.toString(),
                plan_id: { [Op.in]: planIds },
                status: 'active'
            },
            include: ['plan'],
            order: [['created_at', 'DESC']]
        });

        // Check if still valid
        if (subscription && subscription.isActive()) {
            return subscription;
        }

        return null;
    }

    /**
     * Show welcome message with plans for new users
     */
    async showWelcomeWithPlans(ctx, plans, botRecord, firstName, isEdit = false) {
        if (plans.length === 0) {
            const text = `👋 Olá, ${firstName}!\n\nInfelizmente não há planos disponíveis no momento.`;
            return isEdit ? ctx.editMessageText(text) : ctx.reply(text);
        }

        let welcomeMsg = botRecord.welcome_message || `👋 Olá, {nome}! Bem-vindo!`;
        welcomeMsg = welcomeMsg.replace('{nome}', firstName);

        const buttons = plans.map(plan => {
            const duration = plan.duration_days === 0 ? 'Vitalício' : `${plan.duration_days} dias`;
            const price = `R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}`;
            return [Markup.button.callback(`${plan.name} - ${price} (${duration})`, `plan_${plan.id}`)];
        });

        const text = `${welcomeMsg}\n\n📋 *Escolha seu plano:*`;
        const options = {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        };

        return isEdit ? ctx.editMessageText(text, options) : ctx.reply(text, options);
    }

    /**
     * Show member menu for active subscribers
     */
    async showMemberMenu(ctx, subscription, botRecord, firstName, isEdit = false) {
        const plan = subscription.plan;
        const expiresAt = subscription.expires_at
            ? new Date(subscription.expires_at).toLocaleDateString('pt-BR')
            : 'Nunca (Vitalício)';

        const buttons = [
            [Markup.button.callback('🔗 Acessar Grupo VIP', 'get_group_link')],
            [Markup.button.callback('📊 Status da Assinatura', 'view_status')],
            [Markup.button.callback('🔄 Renovar', 'renew_sub'), Markup.button.callback('❌ Cancelar', 'cancel_sub')]
        ];

        const text = `✅ *Bem-vindo de volta, ${firstName}!*\n\n` +
            `📦 Plano: *${plan?.name || 'VIP'}*\n` +
            `📅 Válido até: ${expiresAt}\n\n` +
            `Escolha uma opção abaixo:`;

        const options = {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        };

        return isEdit ? ctx.editMessageText(text, options) : ctx.reply(text, options);
    }

    /**
     * Show payment options for a plan
     */
    async showPaymentOptions(ctx, plan, botRecord, telegramUser, isEdit = false) {
        const firstName = telegramUser.first_name || 'Usuário';
        const externalRef = `${plan.id}_${telegramUser.id}_${Date.now()}`;

        // Generate payment link
        const paymentUrl = `${config.urls.frontend}/checkout?plan=${plan.id}&ref=${externalRef}&tg_id=${telegramUser.id}&tg_name=${encodeURIComponent(firstName)}&tg_user=${telegramUser.username || ''}`;

        const messageText =
            `📦 *${plan.name}*\n\n` +
            `💰 Valor: R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}\n` +
            `⏱ Duração: ${plan.duration_days === 0 ? 'Vitalício' : `${plan.duration_days} dias`}\n` +
            `${plan.description ? `📝 ${plan.description}\n` : ''}\n` +
            `Olá, ${firstName}! Para finalizar a compra, clique em "Pagar":\n\n` +
            `✅ Após o pagamento, você receberá o link do grupo VIP automaticamente!`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url('💳 Pagar Agora', paymentUrl)],
            [Markup.button.callback('« Voltar aos Planos', 'back_to_plans')]
        ]);

        if (isEdit) {
            await ctx.editMessageText(messageText, { parse_mode: 'Markdown', ...keyboard });
        } else {
            await ctx.reply(messageText, { parse_mode: 'Markdown', ...keyboard });
        }
    }

    /**
     * Handle incoming webhook update
     */
    async handleWebhook(token, update) {
        const botId = this.tokenToBot.get(token);
        if (!botId) {
            const bot = await Bot.findOne({ where: { token } });
            if (bot) {
                await this.registerBot(bot);
            }
            return;
        }

        const telegrafBot = this.bots.get(botId);
        if (telegrafBot) {
            await telegrafBot.handleUpdate(update);
        }
    }

    /**
     * Notify user about subscription activation
     */
    async notifySubscriptionActivated(subscription) {
        try {
            const plan = await Plan.findByPk(subscription.plan_id, {
                include: ['bot']
            });

            if (!plan?.bot) return;

            const telegrafBot = this.bots.get(plan.bot.id);
            if (!telegrafBot) return;

            const expiresAt = subscription.expires_at
                ? new Date(subscription.expires_at).toLocaleDateString('pt-BR')
                : 'Nunca (Vitalício)';

            await telegrafBot.telegram.sendMessage(
                subscription.user_telegram_id,
                `🎉 *Pagamento Confirmado!*\n\n` +
                `Sua assinatura do plano *${plan.name}* foi ativada.\n\n` +
                `📅 Válido até: ${expiresAt}\n\n` +
                `Use /grupo para acessar o grupo VIP! 🚀`,
                { parse_mode: 'Markdown' }
            );

            // Add user to VIP channel if configured
            if (plan.bot.channel_id) {
                try {
                    await telegrafBot.telegram.unbanChatMember(
                        plan.bot.channel_id,
                        subscription.user_telegram_id,
                        { only_if_banned: true }
                    );

                    // Create invite link
                    const inviteLink = await telegrafBot.telegram.createChatInviteLink(
                        plan.bot.channel_id,
                        { member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 3600 }
                    );

                    await telegrafBot.telegram.sendMessage(
                        subscription.user_telegram_id,
                        `🔗 *Acesse o grupo VIP:*\n\n${inviteLink.invite_link}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (channelError) {
                    console.error('[TelegramEngine] Error adding to channel:', channelError);
                }
            }
        } catch (error) {
            console.error('[TelegramEngine] Error notifying user:', error);
        }
    }

    /**
     * Notify user about subscription expiration
     */
    async notifySubscriptionExpired(subscription) {
        try {
            const plan = await Plan.findByPk(subscription.plan_id, {
                include: ['bot']
            });

            if (!plan?.bot) return;

            const telegrafBot = this.bots.get(plan.bot.id);
            if (!telegrafBot) return;

            await telegrafBot.telegram.sendMessage(
                subscription.user_telegram_id,
                `⚠️ *Assinatura Expirada*\n\n` +
                `Sua assinatura do plano *${plan.name}* expirou.\n\n` +
                `Para continuar tendo acesso ao grupo VIP, use /renovar`,
                { parse_mode: 'Markdown' }
            );

            // Remove from VIP channel
            if (plan.bot.channel_id) {
                try {
                    await telegrafBot.telegram.banChatMember(
                        plan.bot.channel_id,
                        subscription.user_telegram_id
                    );
                    // Unban immediately to allow rejoining if they renew
                    await telegrafBot.telegram.unbanChatMember(
                        plan.bot.channel_id,
                        subscription.user_telegram_id
                    );
                } catch (error) {
                    console.error('[TelegramEngine] Error removing from channel:', error);
                }
            }
        } catch (error) {
            console.error('[TelegramEngine] Error notifying expiration:', error);
        }
    }

    /**
     * Send renewal reminder
     */
    async sendRenewalReminder(subscription, daysLeft) {
        try {
            const plan = await Plan.findByPk(subscription.plan_id, {
                include: ['bot']
            });

            if (!plan?.bot) return;

            const telegrafBot = this.bots.get(plan.bot.id);
            if (!telegrafBot) return;

            await telegrafBot.telegram.sendMessage(
                subscription.user_telegram_id,
                `⏰ *Lembrete de Renovação*\n\n` +
                `Sua assinatura do plano *${plan.name}* expira em ${daysLeft} dia(s).\n\n` +
                `Renove agora para não perder acesso ao grupo VIP!\n\n` +
                `Use /renovar para renovar sua assinatura.`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('[TelegramEngine] Error sending reminder:', error);
        }
    }

    /**
     * Stop a bot
     */
    async stopBot(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            try {
                await bot.telegram.deleteWebhook();
                bot.stop();
            } catch (error) {
                console.error('[TelegramEngine] Error stopping bot:', error);
            }
            this.bots.delete(botId);
        }
    }

    /**
     * Stop all bots
     */
    async shutdown() {
        for (const [botId] of this.bots) {
            await this.stopBot(botId);
        }
        console.log('[TelegramEngine] All bots stopped');
    }
}

module.exports = new TelegramEngine();
