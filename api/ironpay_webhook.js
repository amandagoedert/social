// Vercel Serverless Function para receber webhooks da IronPay
// Este arquivo deve estar em /api/ironpay_webhook.js para funcionar no Vercel

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Lidar com requisições OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Apenas aceitar requisições POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const data = req.body;
        
        console.log('=== WEBHOOK RECEBIDO ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Dados recebidos:', JSON.stringify(data, null, 2));
        
        // Extrair informações importantes
        const transactionHash = data.transaction_hash || data.hash || data.id;
        const status = data.status || data.payment_status;
        const amount = data.amount;
        const paymentMethod = data.payment_method;
        const paidAt = data.paid_at || data.paidAt;
        
        console.log('--- Informações Extraídas ---');
        console.log('Transaction Hash:', transactionHash);
        console.log('Status:', status);
        console.log('Amount:', amount ? `R$ ${(amount / 100).toFixed(2)}` : 'N/A');
        console.log('Payment Method:', paymentMethod);
        console.log('Paid At:', paidAt);
        
        // Processar conforme o status
        switch (status) {
            case 'paid':
            case 'approved':
                console.log('✅ PAGAMENTO APROVADO!');
                // TODO: Implementar lógica de negócio aqui
                // - Atualizar banco de dados
                // - Enviar email de confirmação
                // - Liberar acesso ao produto/serviço
                break;
                
            case 'pending':
            case 'waiting_payment':
                console.log('⏳ PAGAMENTO PENDENTE');
                break;
                
            case 'failed':
            case 'rejected':
            case 'canceled':
                console.log('❌ PAGAMENTO FALHOU/CANCELADO');
                break;
                
            case 'refunded':
                console.log('↩️ PAGAMENTO REEMBOLSADO');
                break;
                
            default:
                console.log('⚠️ STATUS DESCONHECIDO:', status);
        }
        
        // Responder com sucesso
        res.status(200).json({
            success: true,
            message: 'Webhook received and processed',
            transactionHash: transactionHash,
            status: status
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar webhook:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

