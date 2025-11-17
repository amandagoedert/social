# CNH Social 2025

Site para inscrição no programa CNH Social com integração de pagamento PIX via IronPay.

## 🚀 Tecnologias

- HTML5
- CSS3
- JavaScript (Vanilla)
- IronPay API (Pagamentos PIX)
- Vercel (Deploy)

## 📋 Funcionalidades

- ✅ Formulário de inscrição
- ✅ Geração de QR Code PIX
- ✅ Código PIX copia e cola
- ✅ Integração com IronPay
- ✅ Webhook para notificações de pagamento

## 🛠️ Instalação Local

### Pré-requisitos

- Python 3 (para servidor local)
- Node.js (opcional, para webhook local)

### Executar Localmente

```bash
# Servidor HTTP simples
python3 -m http.server 8000

# Acesse: http://localhost:8000
```

### Webhook Local (Opcional)

```bash
# Instalar dependências
npm install

# Executar webhook
npm start

# O webhook estará em: http://localhost:3000/ironpay_webhook
```

## 📤 Deploy

### GitHub

1. Crie um repositório no GitHub
2. Execute:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

### Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Conecte sua conta GitHub
3. Importe o repositório
4. Deploy automático!

**URL do Webhook no Vercel:**
```
https://seu-projeto.vercel.app/ironpay_webhook
```

## ⚙️ Configuração

### IronPay API

As credenciais estão configuradas no arquivo `js/page-2194861fd18157c8.js`:

- **API Token:** Configurado
- **Product Hash:** `snx2ginhct`
- **Offer Hash:** `t8vmgiaftf`

### Webhook

Configure a URL do webhook no painel da IronPay:
- **Produção:** `https://seu-projeto.vercel.app/ironpay_webhook`
- **Desenvolvimento:** Use ngrok para expor localhost

## 📁 Estrutura do Projeto

```
cnh/
├── index.html              # Página principal
├── js/
│   ├── page-*.js          # Lógica principal e integração PIX
│   └── pix-buttons.js     # Event listeners para botões
├── api/
│   └── ironpay_webhook.js # Serverless function para Vercel
├── ironpay_webhook.js     # Webhook Node.js (desenvolvimento)
├── vercel.json            # Configuração do Vercel
├── package.json           # Dependências Node.js
└── DEPLOY.md              # Guia de deploy detalhado
```

## 🔒 Segurança

⚠️ **IMPORTANTE:** Em produção, mova as credenciais da API para variáveis de ambiente!

## 📝 Licença

ISC

