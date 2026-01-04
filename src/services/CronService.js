const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, Plan } = require('../models');
const TelegramEngine = require('./TelegramEngine');

/**
 * Cron Service
 * Handles scheduled tasks like subscription expiration
 */
class CronService {
    constructor() {
        this.jobs = [];
    }

    /**
     * Initialize all cron jobs
     */
    init() {
        console.log('[CronService] Initializing scheduled tasks...');

        // Run every hour at minute 0
        const expirationJob = cron.schedule('0 * * * *', () => {
            this.processExpiredSubscriptions();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        this.jobs.push(expirationJob);

        // Also run immediately on startup
        this.processExpiredSubscriptions();

        console.log('[CronService] ✅ Expiration check scheduled (every hour)');
    }

    /**
     * Process expired subscriptions
     * - Find active subscriptions with expires_at in the past
     * - Update status to 'expired'
     * - Ban user from Telegram channel
     * - Notify user via Telegram
     */
    async processExpiredSubscriptions() {
        console.log('[CronService] Checking for expired subscriptions...');

        try {
            const now = new Date();

            // Find expired subscriptions
            const expiredSubscriptions = await Subscription.findAll({
                where: {
                    status: 'active',
                    expires_at: {
                        [Op.not]: null,
                        [Op.lt]: now
                    }
                },
                include: [{
                    association: 'plan',
                    include: [{
                        association: 'bot'
                    }]
                }]
            });

            if (expiredSubscriptions.length === 0) {
                console.log('[CronService] No expired subscriptions found.');
                return;
            }

            console.log(`[CronService] Found ${expiredSubscriptions.length} expired subscriptions`);

            for (const subscription of expiredSubscriptions) {
                try {
                    // Update status to expired
                    await subscription.update({ status: 'expired' });

                    // Notify and remove from channel via TelegramEngine
                    await TelegramEngine.notifySubscriptionExpired(subscription);

                    console.log(`[CronService] Subscription ${subscription.id} expired for Telegram user ${subscription.user_telegram_id}`);
                } catch (error) {
                    console.error(`[CronService] Error processing subscription ${subscription.id}:`, error);
                }
            }

            console.log(`[CronService] Processed ${expiredSubscriptions.length} expired subscriptions`);
        } catch (error) {
            console.error('[CronService] Error in processExpiredSubscriptions:', error);
        }
    }

    /**
     * Check subscriptions expiring soon (for reminder notifications)
     * Run daily at 10:00 AM
     */
    initExpirationReminders() {
        const reminderJob = cron.schedule('0 10 * * *', async () => {
            await this.sendExpirationReminders();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        this.jobs.push(reminderJob);
        console.log('[CronService] ✅ Expiration reminders scheduled (daily at 10:00)');
    }

    /**
     * Send reminders 3 days before expiration
     */
    async sendExpirationReminders() {
        console.log('[CronService] Sending expiration reminders...');

        try {
            const threeDaysFromNow = new Date();
            threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Find subscriptions expiring in exactly 3 days
            const expiringSubscriptions = await Subscription.findAll({
                where: {
                    status: 'active',
                    expires_at: {
                        [Op.gte]: today,
                        [Op.lt]: threeDaysFromNow
                    }
                },
                include: [{
                    association: 'plan',
                    include: ['bot']
                }]
            });

            for (const subscription of expiringSubscriptions) {
                try {
                    await TelegramEngine.sendExpirationReminder(subscription);
                } catch (error) {
                    console.error(`[CronService] Error sending reminder for ${subscription.id}:`, error);
                }
            }

            console.log(`[CronService] Sent ${expiringSubscriptions.length} expiration reminders`);
        } catch (error) {
            console.error('[CronService] Error in sendExpirationReminders:', error);
        }
    }

    /**
     * Stop all cron jobs
     */
    stop() {
        for (const job of this.jobs) {
            job.stop();
        }
        console.log('[CronService] All jobs stopped');
    }
}

module.exports = new CronService();
