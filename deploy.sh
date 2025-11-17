#!/bin/bash

# Script de deploy para GitHub e Vercel
# Uso: ./deploy.sh "mensagem do commit"

echo "🚀 Iniciando processo de deploy..."

# Verificar se o Git está inicializado
if [ ! -d ".git" ]; then
    echo "📦 Inicializando repositório Git..."
    git init
fi

# Verificar se há mudanças
if [ -z "$(git status --porcelain)" ]; then
    echo "⚠️  Nenhuma mudança detectada. Nada para fazer commit."
    exit 0
fi

# Mensagem do commit
COMMIT_MSG=${1:-"Atualização do projeto"}

echo "📝 Adicionando arquivos..."
git add .

echo "💾 Fazendo commit: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Verificar se há remote configurado
if ! git remote | grep -q "origin"; then
    echo ""
    echo "⚠️  Repositório remoto não configurado!"
    echo ""
    echo "Para configurar, execute:"
    echo "  git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git"
    echo ""
    read -p "Deseja configurar agora? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        read -p "Digite a URL do repositório GitHub: " REPO_URL
        git remote add origin "$REPO_URL"
    else
        echo "❌ Deploy cancelado. Configure o remote primeiro."
        exit 1
    fi
fi

echo "📤 Enviando para GitHub..."
git push origin main || git push origin master

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Acesse https://vercel.com"
echo "2. Importe o repositório do GitHub"
echo "3. Configure a URL do webhook na IronPay: https://seu-projeto.vercel.app/ironpay_webhook"
echo ""

