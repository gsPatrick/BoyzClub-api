const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plan = sequelize.define('Plan', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    bot_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'bots',
            key: 'id'
        }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Nome do plano (ex: Mensal, Vitalício)'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Valor em Reais'
    },
    duration_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
        comment: '0 = Vitalício'
    },
    gateway_product_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID do produto no Gateway (Stripe, Asaas, etc)'
    },
    gateway_price_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID do preço/plano no Gateway'
    },
    is_recurring: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Se é assinatura recorrente'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
    }
}, {
    tableName: 'plans'
});

module.exports = Plan;
