const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    subscription_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'subscriptions',
            key: 'id'
        }
    },
    gateway: {
        type: DataTypes.ENUM('asaas', 'mercadopago', 'stripe'),
        allowNull: false
    },
    gateway_payment_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'ID do pagamento no Gateway'
    },
    gateway_invoice_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'URL da fatura/boleto'
    },
    amount_gross: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Valor bruto da transação'
    },
    amount_net_creator: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Valor líquido para o criador (após Split)'
    },
    amount_platform_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Taxa da plataforma'
    },
    payment_method: {
        type: DataTypes.ENUM('pix', 'credit_card', 'boleto', 'undefined'),
        defaultValue: 'undefined'
    },
    gateway_status: {
        type: DataTypes.STRING(50),
        defaultValue: 'PENDING',
        comment: 'Status retornado pelo gateway'
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'failed', 'refunded'),
        defaultValue: 'pending'
    },
    paid_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    refunded_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        comment: 'Dados adicionais do gateway (webhook payload, etc)'
    }
}, {
    tableName: 'transactions',
    indexes: [
        { fields: ['subscription_id'] },
        { fields: ['gateway_payment_id'] },
        { fields: ['status'] }
    ]
});

module.exports = Transaction;
