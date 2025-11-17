# Webhook IronPay - Guia de Instalação

Este arquivo implementa um servidor webhook em Node.js para receber notificações de pagamento da IronPay.

## 📋 Pré-requisitos

- Node.js versão 12 ou superior
- NPM (geralmente vem com Node.js)

## 🚀 Instalação

1. **Instalar dependências** (opcional, apenas se usar nodemon para desenvolvimento):
```bash
npm install
```

2. **Configurar variáveis de ambiente** (opcional):
```bash
export PORT=3000
export IRONPAY_WEBHOOK_SECRET=sua_chave_secreta_aqui
```

## ▶️ Executar o Servidor

### Modo Produção:
```bash
node ironpay_webhook.js
```

### Modo Desenvolvimento (com auto-reload):
```bash
npm run dev
```

O servidor iniciará na porta 3000 (ou na porta definida na variável de ambiente PORT).

## 🔗 Configuração na IronPay

1. Acesse o painel da IronPay
2. Vá em Configurações > Webhooks
3. Configure a URL do webhook:
   - **Desenvolvimento local**: Use um serviço como ngrok para expor sua porta local
   - **Produção**: `https://seu-dominio.com/ironpay_webhook` ou `https://seu-dominio.com/ironpay_webhook.php`

## 📡 Endpoints

- **POST** `/ironpay_webhook` - Recebe notificações da IronPay
- **POST** `/ironpay_webhook.php` - Mesmo endpoint (compatibilidade)

## 📝 Formato das Notificações

A IronPay enviará notificações no seguinte formato:

```json
{
  "transaction_hash": "abc123def456",
  "status": "paid",
  "amount": 6190,
  "payment_method": "pix",
  "paid_at": "2025-01-20T10:15:00Z"
}
```

### Status Possíveis:
- `paid` / `approved` - Pagamento aprovado
- `pending` / `waiting_payment` - Pagamento pendente
- `failed` / `rejected` / `canceled` - Pagamento falhou/cancelado
- `refunded` - Pagamento reembolsado

## 📂 Logs

Os logs são salvos automaticamente em:
- `./logs/payments_YYYY-MM-DD.json` - Um arquivo por dia com todos os pagamentos processados

## 🔒 Segurança

Para produção, recomenda-se:

1. **Validar assinatura HMAC** (se a IronPay suportar):
   - Configure `IRONPAY_WEBHOOK_SECRET` no código
   - Implemente validação na função `validateRequest()`

2. **Usar HTTPS**:
   - Configure um proxy reverso (Nginx, Apache) com SSL
   - Ou use um serviço como Cloudflare

3. **Autenticação adicional**:
   - Adicione verificação de IP (whitelist da IronPay)
   - Use tokens de autenticação

## 🛠️ Personalização

Edite as funções em `ironpay_webhook.js` para implementar sua lógica de negócio:

- `handlePaymentApproved()` - Quando pagamento é aprovado
- `handlePaymentPending()` - Quando pagamento está pendente
- `handlePaymentFailed()` - Quando pagamento falha
- `handlePaymentRefunded()` - Quando pagamento é reembolsado

## 🌐 Expor Localmente (Desenvolvimento)

Para testar localmente, use o ngrok:

```bash
# Instalar ngrok
npm install -g ngrok

# Expor porta local
ngrok http 3000

# Use a URL fornecida pelo ngrok na configuração da IronPay
```

## 📞 Suporte

Para mais informações sobre a API IronPay, consulte a documentação oficial.

