const AsaasService = require('./AsaasService');
const MercadoPagoService = require('./MercadoPagoService');
const StripeService = require('./StripeService');
const config = require('../../config');

/**
 * Payment Gateway Factory
 * Unified interface for all payment gateways
 */
class PaymentService {
    constructor() {
        this.gateways = {
            asaas: AsaasService,
            mercadopago: MercadoPagoService,
            stripe: StripeService
        };
    }

    /**
     * Get gateway service by name
     */
    getGateway(gatewayName) {
        const gateway = this.gateways[gatewayName?.toLowerCase()];
        if (!gateway) {
            throw new Error(`Gateway '${gatewayName}' not supported`);
        }
        return gateway;
    }

    /**
     * Calculate Split for any gateway
     */
    calculateSplit(amount) {
        const platformFee = (amount * config.platformFeePercent) / 100;
        const creatorNet = amount - platformFee;

        return {
            gross: parseFloat(amount.toFixed(2)),
            platformFee: parseFloat(platformFee.toFixed(2)),
            creatorNet: parseFloat(creatorNet.toFixed(2)),
            platformFeePercent: config.platformFeePercent
        };
    }

    /**
     * Create payment link using the appropriate gateway
     */
    async createPaymentLink(gateway, paymentData, creatorWalletId = null) {
        const service = this.getGateway(gateway);

        switch (gateway.toLowerCase()) {
            case 'asaas':
                return await service.createPaymentWithSplit(paymentData, creatorWalletId);

            case 'mercadopago':
                return await service.createPaymentPreference(paymentData, creatorWalletId);

            case 'stripe':
                return await service.createCheckoutSession(paymentData, creatorWalletId);

            default:
                throw new Error(`Gateway '${gateway}' not implemented`);
        }
    }

    /**
     * Create subscription using the appropriate gateway
     */
    async createSubscription(gateway, subscriptionData, creatorWalletId = null) {
        const service = this.getGateway(gateway);

        switch (gateway.toLowerCase()) {
            case 'asaas':
                return await service.createSubscriptionWithSplit(subscriptionData, creatorWalletId);

            case 'mercadopago':
                return await service.createSubscription(subscriptionData);

            case 'stripe':
                return await service.createCheckoutSession({
                    ...subscriptionData,
                    isSubscription: true
                }, creatorWalletId);

            default:
                throw new Error(`Gateway '${gateway}' not implemented`);
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(gateway, subscriptionId) {
        const service = this.getGateway(gateway);
        return await service.cancelSubscription(subscriptionId);
    }

    /**
     * Get list of supported gateways
     */
    getSupportedGateways() {
        return [
            { id: 'asaas', name: 'Asaas', description: 'PIX, Boleto, Cartão' },
            { id: 'mercadopago', name: 'Mercado Pago', description: 'PIX, Cartão' },
            { id: 'stripe', name: 'Stripe', description: 'Cartão Internacional' }
        ];
    }
}

module.exports = new PaymentService();
