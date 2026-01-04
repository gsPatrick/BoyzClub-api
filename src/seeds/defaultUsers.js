const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { User, Bot, Plan } = require('../models');

/**
 * Seed default users
 * Run with: node src/seeds/defaultUsers.js
 */
async function seedDefaultUsers() {
    try {
        console.log('🌱 Starting seed...');

        // Sync database
        await sequelize.sync({ alter: true });

        // Create Admin user
        const adminExists = await User.findOne({ where: { email: 'admin@admin.com' } });
        if (!adminExists) {
            await User.create({
                name: 'Admin',
                email: 'admin@admin.com',
                username: 'admin',
                password_hash: 'admin123',
                role: 'admin',
                status: 'active'
            });
            console.log('✅ Admin user created: admin@admin.com / admin123');
        } else {
            console.log('⏭️  Admin user already exists');
        }

        // Create normal creator user
        const creatorExists = await User.findOne({ where: { email: 'patrick@gmail.com' } });
        let creator;
        if (!creatorExists) {
            creator = await User.create({
                name: 'Patrick',
                email: 'patrick@gmail.com',
                username: 'patrick',
                password_hash: 'patrick123',
                role: 'creator',
                status: 'active',
                gateway_preference: 'asaas',
                pix_key: 'patrick@gmail.com'
            });
            console.log('✅ Creator user created: patrick@gmail.com / patrick123');
            console.log('🔗 Public profile: http://localhost:3000/patrick');

            // Create a demo bot for the creator
            const bot = await Bot.create({
                user_id: creator.id,
                token: 'DEMO_TOKEN_123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
                username: 'PatrickVIPBot',
                name: 'Patrick VIP Bot',
                welcome_message: 'Olá {nome}! Bem-vindo ao meu grupo VIP! 🎉',
                status: 'active',
                channel_id: null
            });
            console.log('✅ Demo bot created: @PatrickVIPBot');

            // Create demo plans
            await Plan.create({
                bot_id: bot.id,
                name: 'Mensal',
                description: 'Acesso por 30 dias',
                price: 29.90,
                duration_days: 30,
                is_recurring: true,
                status: 'active'
            });

            await Plan.create({
                bot_id: bot.id,
                name: 'Trimestral',
                description: 'Acesso por 90 dias',
                price: 79.90,
                duration_days: 90,
                is_recurring: true,
                status: 'active'
            });

            await Plan.create({
                bot_id: bot.id,
                name: 'Vitalício',
                description: 'Acesso para sempre',
                price: 199.90,
                duration_days: 0,
                is_recurring: false,
                status: 'active'
            });

            console.log('✅ Demo plans created: Mensal, Trimestral, Vitalício');

        } else {
            // Update existing user with username if missing
            if (!creatorExists.username) {
                await creatorExists.update({ username: 'patrick' });
                console.log('✅ Updated patrick with username');
            }
            console.log('⏭️  Creator user already exists');
        }

        console.log('\n🎉 Seed completed successfully!\n');
        console.log('📋 Login credentials:');
        console.log('   Admin:   admin@admin.com / admin123');
        console.log('   Creator: patrick@gmail.com / patrick123\n');
        console.log('🔗 Public profile URL: http://localhost:3000/patrick\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed error:', error);
        process.exit(1);
    }
}

seedDefaultUsers();
