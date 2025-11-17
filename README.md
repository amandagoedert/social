# CNH Social 2025

Site para inscrição no programa CNH Social com integração de pagamento PIX via IronPay.

## 🚀 Tecnologias

- HTML5
- CSS3
- JavaScript (Vanilla)
- IronPay API (Pagamentos PIX)
- Vercel (Deploy)
- Next.js API Routes (para credenciais seguras)

## 📋 Funcionalidades

- ✅ Formulário de inscrição
- ✅ Geração de QR Code PIX
- ✅ Código PIX copia e cola
- ✅ Integração com IronPay
- ✅ Webhook para notificações de pagamento
- ✅ **Credenciais seguras via API routes** 🔒

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
4. **Configure as variáveis de ambiente** (veja seção Segurança)
5. Deploy automático!

**URL do Webhook no Vercel:**
```
https://seu-projeto.vercel.app/ironpay_webhook
```

## ⚙️ Configuração

### IronPay API

As credenciais são obtidas de forma segura via API route `/api/config`:

- **API Token:** Via `IRONPAY_API_TOKEN`
- **Product Hash:** Via `IRONPAY_PRODUCT_HASH`
- **Offer Hash:** Via `IRONPAY_OFFER_HASH`

### Webhook

Configure a URL do webhook no painel da IronPay:
- **Produção:** `https://seu-projeto.vercel.app/ironpay_webhook`
- **Desenvolvimento:** Use ngrok para expor localhost

## 🔒 Segurança

### ✅ Implementação Segura de Credenciais

**Problema Resolvido:**
- ❌ Credenciais hardcoded expostas em JavaScript público
- ❌ Risco de interceptação e uso malicioso
- ❌ Possível comprometimento de pagamentos

**Solução Implementada:**
- ✅ API route `/api/config` para acesso seguro às credenciais
- ✅ Variáveis de ambiente no Vercel (`IRONPAY_API_TOKEN`, etc.)
- ✅ Busca assíncrona de credenciais no lado cliente
- ✅ Fallback automático para compatibilidade

### Configuração das Variáveis de Ambiente no Vercel

1. Acesse seu projeto no [Vercel Dashboard](https://vercel.com/dashboard)
2. Vá em **Settings** > **Environment Variables**
3. Adicione as seguintes variáveis:

```
IRONPAY_API_TOKEN=1NW287lbfrc2zlJFRS3p9JYuN68Mz8sxw5sWMNqrgBo5Hc6My3AwZvvf6dpQ
IRONPAY_PRODUCT_HASH=snx2ginhct
IRONPAY_OFFER_HASH=t8vmgiaftf
```

4. **Re-deploy** o projeto para aplicar as mudanças

### Arquivos Modificados

- `api/config.js` - Nova API route para credenciais
- `js/page-*.js` - Código atualizado para buscar credenciais dinamicamente
- `.env.example` - Documentação das variáveis necessárias

## 📁 Estrutura do Projeto

```
cnh/
├── index.html              # Página principal
├── js/
│   ├── page-*.js          # Lógica principal e integração PIX (AGORA SEGURO)
│   └── pix-buttons.js     # Event listeners para botões
├── api/
│   ├── config.js          # 🆕 API route para credenciais seguras
│   └── ironpay_webhook.js # Serverless function para Vercel
├── ironpay_webhook.js     # Webhook Node.js (desenvolvimento)
├── vercel.json            # Configuração do Vercel
├── package.json           # Dependências Node.js
├── .env.example           # 🆕 Exemplo de variáveis de ambiente
└── DEPLOY.md              # Guia de deploy detalhado
```

## 📝 Licença

ISC

