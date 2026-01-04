require('dotenv').config();

module.exports = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 4000,

    // Database
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        name: process.env.DB_NAME || 'boyzclub',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    },

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },

    // Platform Fee
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT) || 10,

    // Asaas
    asaas: {
        apiKey: process.env.ASAAS_API_KEY,
        apiUrl: process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3',
        platformWalletId: process.env.ASAAS_PLATFORM_WALLET_ID
    },

    // Mercado Pago
    mercadoPago: {
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    },

    // Stripe
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },

    // Telegram
    telegram: {
        webhookBaseUrl: process.env.TELEGRAM_WEBHOOK_BASE_URL
    },

    // URLs
    urls: {
        api: process.env.API_BASE_URL || 'http://localhost:4000',
        frontend: process.env.FRONTEND_URL || 'http://localhost:3000'
    }
};
