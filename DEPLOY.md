# Guia de Deploy - GitHub e Vercel

Este guia explica como fazer deploy deste projeto no GitHub e depois no Vercel.

## 📋 Pré-requisitos

1. Conta no GitHub (crie em https://github.com)
2. Conta no Vercel (crie em https://vercel.com)
3. Git instalado no seu computador

## 🚀 Passo 1: Preparar o Repositório Local

### 1.1 Inicializar Git (se ainda não foi feito)

```bash
cd /Users/amandagoedert/Downloads/cnh
git init
```

### 1.2 Criar arquivo .gitignore (se não existir)

O arquivo `.gitignore` já foi criado e inclui:
- `node_modules/`
- `logs/`
- `.env`
- Arquivos do sistema

### 1.3 Adicionar todos os arquivos

```bash
git add .
```

### 1.4 Fazer commit inicial

```bash
git commit -m "Initial commit: CNH Social com integração PIX IronPay"
```

## 📤 Passo 2: Criar Repositório no GitHub

### 2.1 Criar novo repositório

1. Acesse https://github.com/new
2. Escolha um nome para o repositório (ex: `cnh-social`)
3. **NÃO** marque "Initialize with README"
4. Clique em "Create repository"

### 2.2 Conectar repositório local ao GitHub

```bash
# Substitua SEU_USUARIO pelo seu username do GitHub
git remote add origin https://github.com/SEU_USUARIO/cnh-social.git
git branch -M main
git push -u origin main
```

**Nota:** Se você usar autenticação por token:
```bash
git remote add origin https://SEU_TOKEN@github.com/SEU_USUARIO/cnh-social.git
```

## 🌐 Passo 3: Deploy no Vercel

### 3.1 Conectar GitHub ao Vercel

1. Acesse https://vercel.com/login
2. Clique em "Sign Up" ou "Login"
3. Escolha "Continue with GitHub"
4. Autorize o Vercel a acessar seus repositórios

### 3.2 Criar novo projeto

1. No dashboard do Vercel, clique em "Add New..." → "Project"
2. Selecione o repositório `cnh-social` (ou o nome que você escolheu)
3. Clique em "Import"

### 3.3 Configurar o projeto

O Vercel detectará automaticamente que é um projeto estático. As configurações padrão devem funcionar:

- **Framework Preset:** Other
- **Root Directory:** `./` (raiz do projeto)
- **Build Command:** (deixe vazio - não precisa build)
- **Output Directory:** `./` (raiz do projeto)
- **Install Command:** (deixe vazio)

### 3.4 Variáveis de Ambiente (se necessário)

Se você precisar de variáveis de ambiente:
1. Vá em "Environment Variables"
2. Adicione as variáveis necessárias (ex: `IRONPAY_API_TOKEN`)

### 3.5 Deploy

1. Clique em "Deploy"
2. Aguarde o processo (geralmente 1-2 minutos)
3. Quando concluir, você receberá uma URL como: `https://cnh-social.vercel.app`

## 🔄 Passo 4: Atualizações Futuras

### Para fazer deploy de novas alterações:

```bash
# 1. Adicionar arquivos modificados
git add .

# 2. Fazer commit
git commit -m "Descrição das alterações"

# 3. Enviar para GitHub
git push origin main
```

O Vercel detectará automaticamente as mudanças e fará um novo deploy!

## ⚙️ Configurações Importantes

### URL do Webhook

Após o deploy, você precisará atualizar a URL do webhook na IronPay:

1. Acesse o painel da IronPay
2. Vá em Configurações > Webhooks
3. Configure a URL: `https://seu-projeto.vercel.app/ironpay_webhook`

**Nota:** O webhook Node.js precisa ser configurado separadamente, pois o Vercel serve apenas arquivos estáticos por padrão. Para o webhook funcionar, você precisará:

- Opção 1: Usar Vercel Serverless Functions (recomendado)
- Opção 2: Usar outro serviço para o webhook (ex: Railway, Render, Heroku)

## 🐛 Troubleshooting

### Erro: "Repository not found"
- Verifique se o nome do repositório está correto
- Verifique se você tem permissão para acessar o repositório

### Erro: "Build failed"
- Verifique se não há erros de sintaxe no código
- Verifique os logs de build no Vercel

### Webhook não funciona
- O Vercel serve arquivos estáticos por padrão
- Para webhooks, use Vercel Serverless Functions ou outro serviço

## 📝 Próximos Passos

1. ✅ Fazer deploy no GitHub
2. ✅ Fazer deploy no Vercel
3. ⚠️ Configurar webhook (usar Serverless Function ou serviço externo)
4. ⚠️ Atualizar URL do webhook na IronPay
5. ✅ Testar o fluxo completo

