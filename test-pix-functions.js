// Script de teste direto das funções PIX
console.log('🚀 Iniciando testes do sistema PIX...');

// Teste 1: Verificar se as funções existem
console.log('\n📋 Verificando funções disponíveis:');
const functions = [
    'generatePixPayment',
    'fetchPixDetails',
    'generateFallbackPix',
    'showPixModal',
    'copyPixCode',
    'closePixModal',
    'handlePixError',
    'normalizeTransactionResponse',
    'hasPixInformation'
];

functions.forEach(func => {
    if (typeof window[func] === 'function') {
        console.log(`✅ ${func} - OK`);
    } else {
        console.log(`❌ ${func} - NÃO ENCONTRADA`);
    }
});

// Teste 2: Testar generateFallbackPix
console.log('\n🧪 Teste 1: Sistema de Fallback PIX');
try {
    if (typeof generateFallbackPix === 'function') {
        console.log('Executando generateFallbackPix...');
        generateFallbackPix();
        console.log('✅ generateFallbackPix executado com sucesso');
    } else {
        console.log('❌ generateFallbackPix não encontrada');
    }
} catch (error) {
    console.log('❌ Erro em generateFallbackPix:', error.message);
}

// Teste 3: Testar showPixModal com dados simulados
console.log('\n🧪 Teste 2: Modal PIX');
try {
    if (typeof showPixModal === 'function') {
        const testData = {
            id: 'TEST_' + Date.now(),
            hash: 'test_hash',
            payment_status: 'pending',
            amount: 6190,
            pix_code: '00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5925CNH SOCIAL PAGAMENTO6009SAO PAULO62070503***6304ABCD',
            qr_code_url: null,
            fallback: false
        };

        console.log('Executando showPixModal com dados de teste...');
        showPixModal(testData);
        console.log('✅ showPixModal executado com sucesso');
    } else {
        console.log('❌ showPixModal não encontrada');
    }
} catch (error) {
    console.log('❌ Erro em showPixModal:', error.message);
}

// Teste 4: Testar fetchPixDetails com hash fictício
console.log('\n🧪 Teste 3: Sistema de Retry');
try {
    if (typeof fetchPixDetails === 'function') {
        const testHash = 'INVALID_HASH_' + Date.now();
        console.log('Executando fetchPixDetails com hash inválido (deve ativar fallback)...');
        fetchPixDetails(testHash, 0);
        console.log('✅ fetchPixDetails iniciado (aguardando resposta da API)');
    } else {
        console.log('❌ fetchPixDetails não encontrada');
    }
} catch (error) {
    console.log('❌ Erro em fetchPixDetails:', error.message);
}

// Teste 5: Testar copyPixCode
console.log('\n🧪 Teste 4: Função de Cópia');
try {
    if (typeof copyPixCode === 'function') {
        const testCode = '00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5925CNH SOCIAL PAGAMENTO6009SAO PAULO62070503***6304ABCD';

        // Criar botão de teste
        const testButton = document.createElement('button');
        testButton.textContent = 'Teste Copiar';
        testButton.style.position = 'absolute';
        testButton.style.left = '-9999px';
        document.body.appendChild(testButton);

        console.log('Executando copyPixCode...');
        copyPixCode(testCode, testButton);

        // Remover botão de teste
        setTimeout(() => {
            document.body.removeChild(testButton);
        }, 1000);

        console.log('✅ copyPixCode executado');
    } else {
        console.log('❌ copyPixCode não encontrada');
    }
} catch (error) {
    console.log('❌ Erro em copyPixCode:', error.message);
}

console.log('\n🎯 Todos os testes foram executados!');
console.log('Verifique os resultados no console e na interface.');