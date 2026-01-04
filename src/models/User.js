const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    username: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        comment: 'Username único para URL pública'
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('admin', 'creator'),
        defaultValue: 'creator'
    },
    pix_key: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Chave Pix para recebimento de repasses'
    },
    asaas_customer_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID do cliente no Asaas'
    },
    asaas_wallet_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID da wallet para Split (subconta Asaas)'
    },
    gateway_preference: {
        type: DataTypes.ENUM('asaas', 'mercadopago', 'stripe'),
        defaultValue: 'asaas'
    },
    gateway_api_token: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Token de API do gateway escolhido pelo criador'
    },
    webhook_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'URL exclusiva de webhook do criador'
    },
    status: {
        type: DataTypes.ENUM('active', 'paused', 'banned'),
        defaultValue: 'active'
    }
}, {
    tableName: 'users',
    hooks: {
        beforeCreate: async (user) => {
            if (user.password_hash) {
                user.password_hash = await bcrypt.hash(user.password_hash, 10);
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('password_hash')) {
                user.password_hash = await bcrypt.hash(user.password_hash, 10);
            }
        }
    }
});

// Instance methods
User.prototype.validatePassword = async function (password) {
    return bcrypt.compare(password, this.password_hash);
};

User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.password_hash;
    delete values.gateway_api_token;
    return values;
};

module.exports = User;
