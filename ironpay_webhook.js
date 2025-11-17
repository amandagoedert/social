const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

// Configurações
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.IRONPAY_WEBHOOK_SECRET || ''; // Configure uma chave secreta se necessário

/**
 * Servidor webhook para receber notificações da IronPay
 * 
 * Este servidor recebe notificações sobre mudanças no status das transações PIX
 * e processa conforme necessário (atualizar banco de dados, enviar emails, etc.)
 */

// Função para processar a notificação recebida
function processWebhook(data) {
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
            handlePaymentApproved(transactionHash, data);
            break;
            
        case 'pending':
        case 'waiting_payment':
            console.log('⏳ PAGAMENTO PENDENTE');
            handlePaymentPending(transactionHash, data);
            break;
            
        case 'failed':
        case 'rejected':
        case 'canceled':
            console.log('❌ PAGAMENTO FALHOU/CANCELADO');
            handlePaymentFailed(transactionHash, data);
            break;
            
        case 'refunded':
            console.log('↩️ PAGAMENTO REEMBOLSADO');
            handlePaymentRefunded(transactionHash, data);
            break;
            
        default:
            console.log('⚠️ STATUS DESCONHECIDO:', status);
            handleUnknownStatus(transactionHash, data);
    }
    
    return {
        success: true,
        transactionHash,
        status,
        processedAt: new Date().toISOString()
    };
}

// Função para lidar com pagamento aprovado
function handlePaymentApproved(transactionHash, data) {
    // TODO: Implementar lógica de negócio aqui
    // Exemplos:
    // - Atualizar status no banco de dados
    // - Enviar email de confirmação para o cliente
    // - Liberar acesso ao produto/serviço
    // - Registrar no sistema de gestão
    
    console.log('Processando pagamento aprovado para transação:', transactionHash);
    
    // Exemplo: Salvar em arquivo (substitua por banco de dados)
    const fs = require('fs');
    const logData = {
        transactionHash,
        status: 'paid',
        amount: data.amount,
        paidAt: data.paid_at,
        timestamp: new Date().toISOString(),
        fullData: data
    };
    
    // Criar diretório de logs se não existir
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
    }
    
    // Salvar log
    fs.appendFileSync(
        `logs/payments_${new Date().toISOString().split('T')[0]}.json`,
        JSON.stringify(logData) + '\n'
    );
    
    console.log('✅ Pagamento registrado com sucesso');
}

// Função para lidar com pagamento pendente
function handlePaymentPending(transactionHash, data) {
    console.log('Pagamento ainda pendente para transação:', transactionHash);
    // Implementar lógica se necessário
}

// Função para lidar com pagamento falhado
function handlePaymentFailed(transactionHash, data) {
    console.log('Pagamento falhou para transação:', transactionHash);
    // Implementar lógica se necessário (ex: notificar cliente, tentar novamente, etc.)
}

// Função para lidar com reembolso
function handlePaymentRefunded(transactionHash, data) {
    console.log('Pagamento reembolsado para transação:', transactionHash);
    // Implementar lógica se necessário (ex: revogar acesso, notificar cliente, etc.)
}

// Função para lidar com status desconhecido
function handleUnknownStatus(transactionHash, data) {
    console.log('Status desconhecido recebido para transação:', transactionHash);
    // Implementar lógica se necessário
}

// Função para validar a requisição (opcional, se a IronPay usar assinatura)
function validateRequest(body, headers) {
    // Se a IronPay usar assinatura HMAC, implementar validação aqui
    // Exemplo:
    // const signature = headers['x-ironpay-signature'];
    // const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    // hmac.update(body);
    // const expectedSignature = hmac.digest('hex');
    // return signature === expectedSignature;
    
    return true; // Por enquanto, aceitar todas as requisições
}

// Criar servidor HTTP
const server = http.createServer((req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Lidar com requisições OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Apenas aceitar requisições POST
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    // Verificar se é a rota do webhook
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname !== '/ironpay_webhook.php' && parsedUrl.pathname !== '/ironpay_webhook') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }
    
    // Coletar dados da requisição
    let body = '';
    
    req.on('data', (chunk) => {
        body += chunk.toString();
    });
    
    req.on('end', () => {
        try {
            // Validar requisição
            if (!validateRequest(body, req.headers)) {
                console.error('❌ Requisição inválida - assinatura não confere');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }
            
            // Parse do JSON
            let data;
            try {
                data = JSON.parse(body);
            } catch (e) {
                // Se não for JSON, tentar parse como query string
                const querystring = require('querystring');
                data = querystring.parse(body);
            }
            
            // Processar webhook
            const result = processWebhook(data);
            
            // Responder com sucesso
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Webhook received and processed',
                transactionHash: result.transactionHash,
                status: result.status
            }));
            
        } catch (error) {
            console.error('❌ Erro ao processar webhook:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }));
        }
    });
    
    req.on('error', (error) => {
        console.error('❌ Erro na requisição:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request error' }));
    });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log('🚀 Servidor Webhook IronPay iniciado!');
    console.log(`📡 Escutando na porta ${PORT}`);
    console.log(`🔗 URL do webhook: http://localhost:${PORT}/ironpay_webhook`);
    console.log(`📝 Logs serão salvos em: ./logs/`);
    console.log('');
    console.log('⚠️  IMPORTANTE: Configure a URL do webhook na IronPay:');
    console.log(`   http://seu-dominio.com:${PORT}/ironpay_webhook`);
    console.log('');
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
});

// Exportar para uso como módulo (se necessário)
module.exports = { server, processWebhook };

