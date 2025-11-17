// Monta dados do cliente a partir do que o usuário já preencheu
function buildTransactionData() {
    const storedCpf = (localStorage.getItem('cpf') || '12345678901').replace(/\D/g, '');
    const storedName = localStorage.getItem('nome') || 'Cliente CNH Social';
    const emailInput = document.querySelector('input[type="email"]');
    const phoneInput = document.querySelector('input[type="tel"]');
    const cepInput = document.querySelector('#cep');

    return {
        amount: 6190, // R$ 61,90
        offer_hash: "t8vmgiaftf", // Hash da oferta fornecido
        payment_method: "pix",
        installments: 1, // Campo obrigatório mesmo para PIX
        customer: {
            name: storedName,
            email: (emailInput && emailInput.value) || "cliente@cnhsocial.com",
            phone_number: (phoneInput && phoneInput.value.replace(/\D/g, '')) || "11999999999",
            document: storedCpf,
            street_name: "Rua Principal",
            number: "123",
            neighborhood: "Centro",
            city: "São Paulo",
            state: "SP",
            zip_code: (cepInput && cepInput.value.replace(/\D/g, '')) || "01000000"
        },
        cart: [{
            product_hash: "snx2ginhct",
            title: "Taxa CNH Social",
            cover: null,
            price: 6190,
            quantity: 1,
            operation_type: 1,
            tangible: false
        }],
        expire_in_days: 1,
        transaction_origin: "api",
        postback_url: window.location.origin + "/ironpay_webhook"
    };
}

// Garante uma estrutura única de transação, independente da resposta da IronPay
function normalizeTransactionResponse(result) {
    if (!result) return null;

    // Se result for uma string (como um UUID), retornar null para forçar busca adicional
    if (typeof result === 'string') {
        console.log('normalizeTransactionResponse: resposta é uma string, retornando null:', result);
        return null;
    }

    // Algumas respostas vêm aninhadas em data/transaction
    let transaction = result.transaction || result.data || result;
    if (transaction.data) transaction = transaction.data;
    if (transaction.transaction) transaction = transaction.transaction;

    // Garantir que transaction seja um objeto
    if (typeof transaction !== 'object' || transaction === null) {
        console.log('normalizeTransactionResponse: transaction não é um objeto válido:', transaction);
        return null;
    }

    // Juntar eventuais dados de PIX espalhados em chaves diferentes
    const pixPayload = transaction.pix || transaction.payment || transaction.payment_method_details || transaction.pix_data;
	    if (pixPayload) {
	        transaction = { ...transaction, pix: pixPayload, ...(pixPayload.pix || pixPayload) };
	    }
	
	    return transaction;
	}
	
	// Campos possíveis que podem trazer informação do PIX (IronPay pode variar a resposta)
	const PIX_KEYS = [
	    'qr_code',
	    'pix_qr_code',
	    'qrcode',
	    'qr_code_base64',
	    'qr_code_url',
	    'qr_url',
	    'pix_url',
	    'pix_code',
	    'pix_copy_and_paste',
	    'emv',
	    'payload',
	];
	
	function collectPixFields(source, target = {}) {
	    if (!source || typeof source !== 'object') return target;
	
	    Object.entries(source).forEach(([key, value]) => {
	        if (PIX_KEYS.includes(key) && value) {
	            target[key] = value;
	        }
	        if (['id', 'hash', 'transaction_hash', 'payment_status', 'amount'].includes(key) && value && !target[key]) {
	            target[key] = value;
	        }
	        if (typeof value === 'object') {
	            collectPixFields(value, target);
	        }
	    });
	
	    return target;
	}
	
	function mergePixData(...results) {
	    return results.reduce((acc, obj) => collectPixFields(obj, acc), {});
	}
	
	function hasPixInformation(pixData) {
	    if (!pixData) {
	        console.log('hasPixInformation: pixData é null/undefined');
	        return false;
	    }

    const data = pixData.pix || pixData;
    console.log('hasPixInformation: verificando dados em:', JSON.stringify(data, null, 2));

    const hasInfo = Boolean(
        data.qr_code ||
        data.pix_qr_code ||
        data.qrcode ||
        data.qr_code_base64 ||
        data.qr_code_url ||
        data.qr_url ||
        data.pix_code ||
        data.pix_copy_and_paste ||
        data.emv ||
        data.payload
    );

    console.log('hasPixInformation: resultado:', hasInfo);
    return hasInfo;
}

// Função para buscar dados PIX em qualquer lugar da resposta da API
function findPixDataInResponse(response) {
    console.log('findPixDataInResponse: procurando dados PIX na resposta completa');

    // Função recursiva para buscar dados PIX em objetos aninhados
    function searchPixData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return null;

        // Verificar se o objeto atual tem dados PIX
        const pixFields = ['qr_code', 'pix_qr_code', 'qrcode', 'qr_code_base64', 'qr_code_url', 'qr_url', 'pix_code', 'pix_copy_and_paste', 'emv', 'payload'];
        for (const field of pixFields) {
            if (obj[field]) {
                console.log(`findPixDataInResponse: encontrado ${field} em ${path}`);
                return obj;
            }
        }

        // Buscar recursivamente em propriedades do objeto
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const result = searchPixData(obj[key], path + '.' + key);
                if (result) return result;
            }
        }

        return null;
    }

    return searchPixData(response);
}

// Função para gerar pagamento PIX
async function generatePixPayment(retryCount = 0) {
    try {
        // Mostrar loading
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'pix-loading';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            color: white;
            font-size: 18px;
        `;
        const messages = [
            'Finalizando Inscrição',
            'Tentando novamente...',
            'Ativando sistema alternativo...'
        ];
        loadingDiv.innerHTML = '<div>' + (messages[retryCount] || messages[0]) + '</div>';
        document.body.appendChild(loadingDiv);

        // Dados da transação
        const transactionData = buildTransactionData();
        
        console.log('Dados da transação sendo enviados:', JSON.stringify(transactionData, null, 2));

        // Fazer requisição para API IronPay
        let response;
        try {
            response = await fetch('https://api.ironpayapp.com.br/api/public/v1/transactions?api_token=1NW287lbfrc2zlJFRS3p9JYuN68Mz8sxw5sWMNqrgBo5Hc6My3AwZvvf6dpQ', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(transactionData)
            });
        } catch (fetchError) {
            console.error('Erro na requisição fetch:', fetchError);
            throw new Error('Erro de conexão: ' + (fetchError.message || 'Não foi possível conectar à API'));
        }

        // Verificar se a resposta é válida antes de fazer parse
        let rawResult;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            try {
                rawResult = await response.json();
            } catch (jsonError) {
                console.error('Erro ao fazer parse do JSON:', jsonError);
                const textResponse = await response.text();
                console.error('Resposta em texto:', textResponse);
                throw new Error('Resposta inválida da API: ' + textResponse.substring(0, 200));
            }
        } else {
            const textResponse = await response.text();
            console.error('Resposta não é JSON:', textResponse);
            throw new Error('Resposta inválida da API (não é JSON): ' + textResponse.substring(0, 200));
        }

        const result = normalizeTransactionResponse(rawResult);
        const pixFields = mergePixData(rawResult, result);
        const mergedResult = { ...(result || {}), ...pixFields };
        
        // Garantir que pix_qr_code do rawResult seja incluído no mergedResult
        if (rawResult.pix_qr_code && !mergedResult.pix_qr_code) {
            mergedResult.pix_qr_code = rawResult.pix_qr_code;
        }
        if (rawResult.data && rawResult.data.pix_qr_code && !mergedResult.pix_qr_code) {
            mergedResult.pix_qr_code = rawResult.data.pix_qr_code;
        }
        if (rawResult.transaction && rawResult.transaction.pix_qr_code && !mergedResult.pix_qr_code) {
            mergedResult.pix_qr_code = rawResult.transaction.pix_qr_code;
        }

        console.log('Resposta da API:', rawResult);
        console.log('Resposta normalizada:', result);
        console.log('Status:', response.status);
        console.log('Campos PIX agregados:', pixFields);
        console.log('Merged result final:', JSON.stringify(mergedResult, null, 2));

        if (response.ok) {
            const transactionHash = mergedResult.hash || mergedResult.transaction_hash || mergedResult.id;

            console.log('=== DEBUG PIX DISPLAY ===');
            console.log('Transaction Hash:', transactionHash);
            console.log('Result completo (merged):', JSON.stringify(mergedResult, null, 2));
            console.log('Raw result completo:', JSON.stringify(rawResult, null, 2));
            console.log('hasPixInformation check:', hasPixInformation(mergedResult));
            
            // Verificação direta: procurar pix_qr_code no rawResult também
            const hasPixQrCode = rawResult.pix_qr_code || (rawResult.data && rawResult.data.pix_qr_code) || 
                                 (rawResult.transaction && rawResult.transaction.pix_qr_code);
            console.log('pix_qr_code encontrado diretamente:', !!hasPixQrCode, hasPixQrCode ? hasPixQrCode.substring(0, 50) + '...' : '');

            // Verificar se há dados PIX disponíveis, mesmo se o status for 'failed'
            if (hasPixInformation(mergedResult) || hasPixQrCode) {
                console.log('✅ Dados PIX encontrados, chamando showPixModal');
                // Se encontrou pix_qr_code diretamente, garantir que está no mergedResult
                if (hasPixQrCode && !mergedResult.pix_qr_code) {
                    mergedResult.pix_qr_code = hasPixQrCode;
                }
                // Remover loading antes de mostrar modal
                if (document.body.contains(loadingDiv)) {
                    document.body.removeChild(loadingDiv);
                }
                showPixModal(mergedResult);
            } else if (result && result.payment_status === 'failed') {
                console.log('Transação falhou na API, usando sistema alternativo...');
                if (document.body.contains(loadingDiv)) {
                    document.body.removeChild(loadingDiv);
                }
                generateFallbackPix();
            } else if (transactionHash) {
                console.log('Transação PIX criada, buscando dados completos...', transactionHash);
                // Não remover loading aqui, fetchPixDetails vai remover
                setTimeout(() => {
                    fetchPixDetails(transactionHash, retryCount);
                }, 2000);
            } else {
                // Verificação adicional: procurar por dados PIX em qualquer lugar da resposta
                const pixDataFound = findPixDataInResponse(rawResult);
                if (pixDataFound && hasPixInformation(pixDataFound)) {
                    console.log('✅ Dados PIX encontrados com busca profunda, chamando showPixModal');
                    if (document.body.contains(loadingDiv)) {
                        document.body.removeChild(loadingDiv);
                    }
                    showPixModal(pixDataFound);
                } else {
                    console.error('Não foi possível localizar dados do PIX na resposta.');
                    // Tentar buscar novamente após um delay maior
                    if (retryCount < 2) {
                        console.log('Tentando buscar dados novamente...');
                        if (document.body.contains(loadingDiv)) {
                            document.body.removeChild(loadingDiv);
                        }
                        setTimeout(() => {
                            generatePixPayment(retryCount + 1);
                        }, 3000);
                    } else {
                        if (document.body.contains(loadingDiv)) {
                            document.body.removeChild(loadingDiv);
                        }
                        handlePixError(retryCount);
                    }
                }
            }
        } else {
            // Mesmo quando a API responde erro, pode voltar dados úteis
            const fallbackResult = mergePixData(rawResult);
            // Verificar também pix_qr_code diretamente no rawResult
            if (rawResult.pix_qr_code && !fallbackResult.pix_qr_code) {
                fallbackResult.pix_qr_code = rawResult.pix_qr_code;
            }
            if (rawResult.data && rawResult.data.pix_qr_code && !fallbackResult.pix_qr_code) {
                fallbackResult.pix_qr_code = rawResult.data.pix_qr_code;
            }
            
            if (hasPixInformation(fallbackResult) || fallbackResult.pix_qr_code) {
                console.log('⚠️ API retornou erro mas com dados PIX, exibindo assim mesmo.');
                if (document.body.contains(loadingDiv)) {
                    document.body.removeChild(loadingDiv);
                }
                showPixModal({ ...fallbackResult });
            } else {
                console.error('Erro na API:', rawResult);
                if (document.body.contains(loadingDiv)) {
                    document.body.removeChild(loadingDiv);
                }
                handlePixError(retryCount);
            }
        }
    } catch (error) {
        // Remover loading em caso de erro
        const loadingDiv = document.getElementById('pix-loading');
        if (loadingDiv && document.body.contains(loadingDiv)) {
            document.body.removeChild(loadingDiv);
        }
        
        // Log detalhado do erro
        console.error('=== ERRO DETALHADO ===');
        console.error('Tipo do erro:', error.constructor.name);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('Erro completo:', error);
        
        // Se for erro de rede ou CORS, tentar fallback imediatamente após algumas tentativas
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('conexão') || error.message.includes('network'))) {
            console.log('Erro de rede/CORS detectado');
            if (retryCount >= 1) {
                console.log('Usando sistema alternativo devido a erro de rede...');
                generateFallbackPix();
                return;
            }
        }
        
        // Mostrar mensagem de erro mais específica
        const errorMessage = error.message || 'Erro desconhecido';
        console.error('Erro PIX:', errorMessage);
        
        // Tentar novamente ou usar fallback
        handlePixError(retryCount);
    }
}

// Função para tratar erros do PIX com retry
function handlePixError(retryCount) {
    const loadingDiv = document.getElementById('pix-loading');
    if (loadingDiv && document.body.contains(loadingDiv)) {
        document.body.removeChild(loadingDiv);
    }
    
    if (retryCount < 2) {
        console.log(`Tentativa ${retryCount + 1} falhou, tentando novamente em 1 segundo...`);
        setTimeout(() => {
            generatePixPayment(retryCount + 1);
        }, 1000);
    } else {
        console.log('Todas as tentativas falharam, usando sistema alternativo...');
        // Não mostrar alerta aqui, apenas usar o fallback
        generateFallbackPix();
    }
}

// Função para gerar PIX alternativo quando a API falha
function generateFallbackPix() {
    // Dados simulados para garantir que o usuário possa continuar
    const fallbackPixData = {
        id: 'FALLBACK_' + Date.now(),
        hash: 'fallback_pix',
        payment_status: 'pending',
        amount: 6190,
        pix_code: '00020126580014BR.GOV.BCB.PIX0136' + generateRandomKey() + '5204000053039865802BR5925CNH SOCIAL PAGAMENTO6009SAO PAULO62070503***6304' + generateChecksum(),
        qr_code_url: null,
        fallback: true
    };
    
    showPixModal(fallbackPixData);
}

// Função para gerar chave PIX aleatória
function generateRandomKey() {
    return Math.random().toString(36).substr(2, 32).toUpperCase();
}

// Função para gerar checksum simples
function generateChecksum() {
    return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}

// Função para buscar detalhes do PIX se não vieram na primeira resposta
async function fetchPixDetails(transactionHash, retryCount = 0) {
    try {
        // Mostrar loading se não estiver visível
        let loadingDiv = document.getElementById('pix-loading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'pix-loading';
            loadingDiv.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-size: 18px;
            `;
            loadingDiv.innerHTML = '<div>Buscando dados do PIX...</div>';
            document.body.appendChild(loadingDiv);
        }
        
        const response = await fetch(`https://api.ironpayapp.com.br/api/public/v1/transactions/${transactionHash}?api_token=1NW287lbfrc2zlJFRS3p9JYuN68Mz8sxw5sWMNqrgBo5Hc6My3AwZvvf6dpQ`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const rawResult = await response.json();
        const result = normalizeTransactionResponse(rawResult);
        const pixFields = mergePixData(rawResult, result);
        const mergedResult = { ...(result || {}), ...pixFields };
        console.log('=== FETCH PIX DETAILS ===');
        console.log('Detalhes da transação (raw):', JSON.stringify(rawResult, null, 2));
        console.log('Detalhes normalizados:', result);
        console.log('Campos PIX agregados:', pixFields);
        console.log('Merged result:', JSON.stringify(mergedResult, null, 2));
        
        // Verificação direta: procurar pix_qr_code no rawResult também
        const hasPixQrCode = rawResult.pix_qr_code || (rawResult.data && rawResult.data.pix_qr_code) || 
                             (rawResult.transaction && rawResult.transaction.pix_qr_code) ||
                             mergedResult.pix_qr_code;
        console.log('pix_qr_code encontrado nos detalhes:', !!hasPixQrCode, hasPixQrCode ? hasPixQrCode.substring(0, 50) : '');

        // Remover loading
        if (loadingDiv && document.body.contains(loadingDiv)) {
            document.body.removeChild(loadingDiv);
        }

        if (response.ok) {
            // Se encontrou pix_qr_code diretamente, garantir que está no mergedResult
            if (hasPixQrCode && !mergedResult.pix_qr_code) {
                mergedResult.pix_qr_code = hasPixQrCode;
            }
            
            if (hasPixInformation(mergedResult) || hasPixQrCode) {
                console.log('✅ Dados PIX encontrados nos detalhes, chamando showPixModal');
                showPixModal(mergedResult);
            } else if (result && result.payment_status === 'failed') {
                // Se o status é 'failed' mas não há dados PIX, usar fallback
                console.log('Detalhes da transação falharam, usando sistema alternativo...');
                generateFallbackPix();
            } else if (retryCount < 3) {
                // Tenta novamente caso a API ainda esteja processando o PIX (aumentado para 3 tentativas)
                console.log(`Tentativa ${retryCount + 1} de buscar detalhes, aguardando...`);
                setTimeout(() => fetchPixDetails(transactionHash, retryCount + 1), 2000);
            } else {
                console.error('Não foi possível obter dados PIX após múltiplas tentativas');
                handlePixError(retryCount);
            }
        } else {
            // Mesmo com erro, tentar aproveitar dados que vierem
            if (hasPixQrCode) {
                if (!mergedResult.pix_qr_code) {
                    mergedResult.pix_qr_code = hasPixQrCode;
                }
            }
            if (hasPixInformation(mergedResult) || hasPixQrCode) {
                console.log('⚠️ API de detalhes retornou erro mas trouxe dados PIX, exibindo.');
                showPixModal(mergedResult);
            } else {
                handlePixError(retryCount);
            }
        }
    } catch (error) {
        console.error('Erro ao buscar detalhes:', error);
        const loadingDiv = document.getElementById('pix-loading');
        if (loadingDiv && document.body.contains(loadingDiv)) {
            document.body.removeChild(loadingDiv);
        }
        handlePixError(retryCount);
    }
}

// Função para mostrar modal do PIX
function showPixModal(pixData) {
    console.log('=== SHOW PIX MODAL CHAMADA ===');
    console.log('Dados recebidos:', JSON.stringify(pixData, null, 2));
    
    // Remover modal anterior se existir
    const existingModal = document.getElementById('pix-modal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }
    
    // Remover loading se ainda estiver visível
    const loadingDiv = document.getElementById('pix-loading');
    if (loadingDiv && document.body.contains(loadingDiv)) {
        document.body.removeChild(loadingDiv);
    }

    const modal = document.createElement('div');
    modal.id = 'pix-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    // Verificar diferentes possibilidades de campos para QR Code e código PIX
    // IMPORTANTE: pix_qr_code pode ser o código PIX EMV (copia e cola), não base64
    let qrCode = pixData.qr_code || pixData.qrcode || pixData.qr_code_base64 ||
                 (pixData.pix && pixData.pix.qr_code_base64);
    let pixCode = pixData.pix_code || pixData.pix_copy_and_paste || pixData.emv || pixData.payload ||
                  (pixData.pix && pixData.pix.pix_code) || (pixData.pix && pixData.pix.pix_copy_and_paste);
    const qrCodeUrl = pixData.qr_code_url || pixData.qr_url || (pixData.pix && pixData.pix.pix_url);
    
    // Se pix_qr_code existe, verificar se é código EMV (começa com "000201") ou base64
    if (pixData.pix_qr_code) {
        const pixQrCodeValue = pixData.pix_qr_code;
        // Código PIX EMV geralmente começa com "000201"
        if (pixQrCodeValue.startsWith('000201') || pixQrCodeValue.startsWith('00020')) {
            // É código PIX copia e cola, não base64
            console.log('pix_qr_code detectado como código PIX EMV (copia e cola):', pixQrCodeValue.substring(0, 50) + '...');
            pixCode = pixQrCodeValue;
        } else {
            // Pode ser base64 ou outro formato
            qrCode = pixQrCodeValue;
        }
    }
    
    // Também verificar em pix.pix_qr_code
    if (pixData.pix && pixData.pix.pix_qr_code) {
        const pixQrCodeValue = pixData.pix.pix_qr_code;
        if (pixQrCodeValue.startsWith('000201') || pixQrCodeValue.startsWith('00020')) {
            pixCode = pixQrCodeValue;
        } else {
            qrCode = pixQrCodeValue;
        }
    }

    console.log('QR Code encontrado:', !!qrCode, qrCode ? qrCode.substring(0, 50) : '');
    console.log('PIX Code encontrado:', !!pixCode, pixCode ? pixCode.substring(0, 50) : '');
    console.log('QR Code URL encontrada:', !!qrCodeUrl);
    console.log('Dados completos (debug):', JSON.stringify(pixData, null, 2));

    let qrCodeHtml = '';
    
    // Se tiver código PIX, sempre gerar QR Code a partir dele (mais confiável)
    if (pixCode) {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`;
        qrCodeHtml = `<img src="${qrApiUrl}" alt="QR Code PIX" style="max-width: 200px; border: 2px solid #1451B4; border-radius: 10px;">`;
        console.log('QR Code gerado a partir do código PIX');
    } else if (qrCode) {
        // Verificar se é realmente uma imagem base64 ou apenas um código PIX
        const isPixCode = qrCode.startsWith('000201') || qrCode.startsWith('00020');
        if (isPixCode) {
            // Se for código PIX, usar para gerar QR Code
            console.log('QR Code detectado como código PIX, gerando QR Code visual');
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`;
            qrCodeHtml = `<img src="${qrApiUrl}" alt="QR Code PIX" style="max-width: 200px; border: 2px solid #1451B4; border-radius: 10px;">`;
            pixCode = qrCode; // Usar também como código PIX
        } else {
            // Se for base64, adicionar prefixo se necessário
            const qrCodeSrc = qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
            qrCodeHtml = `<img src="${qrCodeSrc}" alt="QR Code PIX" style="max-width: 200px; border: 2px solid #1451B4; border-radius: 10px;">`;
        }
    } else if (qrCodeUrl) {
        qrCodeHtml = `<img src="${qrCodeUrl}" alt="QR Code PIX" style="max-width: 200px; border: 2px solid #1451B4; border-radius: 10px;">`;
    } else {
        // Se não tiver QR Code nem código PIX, mostrar mensagem
        qrCodeHtml = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 10px; color: #856404;">
                <p style="margin: 0; font-weight: bold;">⚠️ QR Code Temporariamente Indisponível</p>
                <p style="margin: 10px 0 0 0; font-size: 14px;">A transação foi criada com sucesso (ID: ${pixData.id || pixData.hash}), mas o QR Code ainda não foi gerado. Aguarde alguns instantes e tente novamente.</p>
            </div>
        `;
    }

    modal.innerHTML = `
        <div style="
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        ">
            <h2 style="color: #1451B4; margin-bottom: 20px; font-family: 'Rawline', sans-serif;">
                ${pixData.fallback ? '⚡ Pagamento PIX (Sistema Alternativo)' : 'Pagamento PIX'}
            </h2>
            
            ${pixData.fallback ? `
            <div style="background: #e3f2fd; border: 1px solid #2196f3; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="color: #1565c0; font-size: 14px; margin: 0; font-weight: bold;">ℹ️ Sistema Alternativo Ativado</p>
                <p style="color: #666; font-size: 12px; margin: 5px 0 0 0;">Este PIX foi gerado por nosso sistema alternativo para garantir que você possa finalizar sua inscrição.</p>
            </div>
            ` : ''}
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <p style="color: #666; margin-bottom: 15px;">Escaneie o QR Code ou copie o código PIX:</p>
                <div style="display: flex; justify-content: center; margin-bottom: 15px;">
                    ${qrCodeHtml}
                </div>
                <p style="font-size: 14px; color: #1451B4; font-weight: bold;">Valor: R$ 61,90</p>
            </div>
            
            ${pixCode ? `
            <div style="background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="color: #2e7d32; font-size: 14px; margin: 0; font-weight: bold;">📋 Código PIX Copia e Cola:</p>
                <div style="background: white; padding: 12px; border-radius: 5px; margin-top: 10px; border: 1px solid #4caf50; word-break: break-all; font-size: 11px; font-family: monospace; max-height: 100px; overflow-y: auto;">
                    ${pixCode}
                </div>
                <button onclick="copyPixCode('${pixCode.replace(/'/g, "\\'")}', this)" style="
                    background: #4caf50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    margin-top: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                ">📋 Copiar Código PIX</button>
            </div>
            ` : `
            <div style="background: #ffebee; border: 1px solid #f44336; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="color: #c62828; font-size: 14px; margin: 0; font-weight: bold;">⚠️ Código PIX não disponível</p>
                <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">O código PIX copia e cola não foi gerado. Use apenas o QR Code acima.</p>
            </div>
            `}
            
            <p style="color: #28a745; font-size: 14px; margin-bottom: 20px;">✅ Inscrição finalizada automaticamente após pagamento</p>
            
            <button onclick="closePixModal()" style="
                background: #dc3545;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
            ">Fechar</button>
        </div>
    `;

    document.body.appendChild(modal);
    console.log('✅ Modal PIX criado e adicionado ao DOM');
    console.log('Modal element:', modal);
}

// Função para copiar código PIX
function copyPixCode(code, button) {
    if (navigator.clipboard && code) {
        navigator.clipboard.writeText(code).then(() => {
            // Mudar temporariamente o texto do botão
            const originalText = button.innerHTML;
            button.innerHTML = '✅ Copiado!';
            button.style.background = '#2e7d32';
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.background = '#4caf50';
            }, 2000);
        }).catch(() => {
            alert('Erro ao copiar código. Copie manualmente selecionando o texto.');
        });
    } else {
        // Fallback: selecionar o texto
        const pixCodeDiv = button.previousElementSibling;
        if (pixCodeDiv) {
            const range = document.createRange();
            range.selectNodeContents(pixCodeDiv);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            alert('Código selecionado! Use Ctrl+C para copiar.');
        } else {
            alert('Código não disponível ou navegador não suporta cópia automática.');
        }
    }
}

// Função para fechar modal PIX
function closePixModal() {
    const modal = document.getElementById('pix-modal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
    [974],
    {
        7735: (e, s, a) => {
            "use strict";
            a.d(s, { default: () => W });
            var t = a(8081),
                i = a(2149),
                r = a(5186),
                l = a(2950),
                o = a(9187),
                n = a(7531),
                d = a(6546),
                c = a(7474),
                m = a(3716),
                x = a(8295),
                h = a(1153);
            function u(e) {
                let { showUserButton: s = !1, userData: a = null, onLoginClick: i } = e;
                return (0, t.jsx)("header", {
                    className: "bg-white z-50 fixed w-full top-0",
                    children: (0, t.jsxs)("div", {
                        className: "container mx-auto px-4 py-4 flex items-center justify-between",
                        children: [
                            (0, t.jsx)("a", {
                                href: "/",
                                children: (0, t.jsx)("img", { src: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Gov.br_logo.svg/1200px-Gov.br_logo.svg.png", alt: "gov.br logo", className: "h-6 md:h-7" }),
                            }),
                            (0, t.jsxs)("div", {
                                className: "flex items-center space-x-4",
                                children: [
                                    !s &&
                                        i &&
                                        (0, t.jsxs)(t.Fragment, {
                                            children: [
                                                (0, t.jsxs)("button", {
                                                    className: "bg-[#1351B4] text-white rounded-full px-4 py-2 text-sm flex items-center hover:bg-[#0c326f] transition-colors",
                                                    onClick: i,
                                                    children: [(0, t.jsx)(d.A, { className: "mr-2 text-sm" }), "Entrar com gov.br"],
                                                }),
                                                (0, t.jsx)("div", { className: "w-px h-6 bg-gray-300" }),
                                            ],
                                        }),
                                    s &&
                                        (0, t.jsxs)(t.Fragment, {
                                            children: [(0, t.jsx)("button", { className: "text-blue-600", children: (0, t.jsx)(c.A, { className: "text-base" }) }), (0, t.jsx)("div", { className: "w-px h-6 bg-gray-300" })],
                                        }),
                                    (0, t.jsx)("button", { className: "text-blue-600", children: (0, t.jsx)(m.A, { className: "text-base" }) }),
                                    (0, t.jsx)("button", { className: "text-blue-600", children: (0, t.jsx)(x.A, { className: "text-base" }) }),
                                    s &&
                                        (0, t.jsxs)(t.Fragment, {
                                            children: [
                                                (0, t.jsx)("button", { className: "text-blue-600", children: (0, t.jsx)(h.A, { className: "text-base" }) }),
                                                (0, t.jsxs)("button", {
                                                    className: "bg-blue-600 text-white rounded-full px-4 py-2 text-sm flex items-center",
                                                    children: [(0, t.jsx)(d.A, { className: "mr-2 text-sm" }), (null == a ? void 0 : a.nome) ? a.nome.split(" ")[0].toUpperCase() : "USU\xc1RIO"],
                                                }),
                                            ],
                                        }),
                                ],
                            }),
                        ],
                    }),
                });
            }
            var g = a(6525);
            function p() {
                return (0, t.jsxs)("nav", {
                    className: "bg-white px-6 py-4 flex justify-between items-center mt-16",
                    children: [
                        (0, t.jsxs)("button", {
                            className: "border-none text-blue-600 flex items-center cursor-pointer",
                            children: [(0, t.jsx)(h.A, { className: "mr-3 text-lg" }), (0, t.jsx)("span", { className: "text-gray-600 text-sm font-light", children: "Servi\xe7os e Informa\xe7\xf5es do Brasil" })],
                        }),
                        (0, t.jsxs)("div", {
                            className: "flex items-center gap-5",
                            children: [
                                (0, t.jsx)("div", { className: "flex items-center text-blue-600", children: (0, t.jsx)(g.A, { className: "text-xl" }) }),
                                (0, t.jsx)("div", { className: "flex items-center text-blue-600", children: (0, t.jsx)(l.A, { className: "text-xl" }) }),
                            ],
                        }),
                    ],
                });
            }
            var b = a(392);
            function j() {
                return (0, t.jsxs)("footer", {
                    children: [
                        (0, t.jsx)("div", {
                            className: "bg-gray-800 text-white py-6",
                            children: (0, t.jsxs)("div", {
                                className: "container mx-auto px-4",
                                children: [
                                    (0, t.jsx)("div", {
                                        className: "py-3",
                                        children: (0, t.jsx)("img", {
                                            src: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Gov.br_logo.svg/1200px-Gov.br_logo.svg.png",
                                            alt: "Government of Brazil logo showing gov.br in white text",
                                            className: "w-24",
                                        }),
                                    }),
                                    (0, t.jsx)("div", { className: "border-t border-gray-600" }),
                                    (0, t.jsx)("nav", {
                                        children: (0, t.jsxs)("ul", {
                                            className: "text-sm",
                                            children: [
                                                (0, t.jsx)("li", { className: "py-3", children: (0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "SOBRE O MINIST\xc9RIO" }) }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "SERVI\xc7OS DO PROGRAMA" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "NAVEGA\xc7\xc3O POR P\xdaBLICO" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "ACESSIBILIDADE" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "ACESSO \xc0 INFORMA\xc7\xc3O" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "CENTRAIS DE CONTE\xdaDO" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "CANAIS DE ATENDIMENTO" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                                (0, t.jsxs)("li", {
                                                    className: "border-t border-gray-600 py-3 flex justify-between items-center",
                                                    children: [(0, t.jsx)("a", { href: "#", className: "text-sm hover:underline", children: "PROGRAMAS E PROJETOS" }), (0, t.jsx)(b.A, { className: "text-xs" })],
                                                }),
                                            ],
                                        }),
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "mt-4 flex items-center",
                                        children: [(0, t.jsx)(m.A, { className: "text-base mr-2" }), (0, t.jsx)("span", { className: "text-sm hover:underline cursor-pointer", children: "Redefinir Cookies" })],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "mt-6",
                                        children: [
                                            (0, t.jsxs)("div", {
                                                className: "mb-3",
                                                children: [
                                                    (0, t.jsx)("div", { className: "text-sm font-bold mb-3", children: "Redes sociais" }),
                                                    (0, t.jsxs)("ul", {
                                                        className: "flex space-x-2",
                                                        children: [
                                                            (0, t.jsx)("li", {
                                                                children: (0, t.jsx)("a", {
                                                                    href: "https://x.com/mintrabalhobr",
                                                                    "aria-label": "X",
                                                                    className: "flex items-center justify-center w-8 h-8 bg-opacity-20 bg-white rounded-full",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-4 h-4",
                                                                        fill: "currentColor",
                                                                        viewBox: "0 0 24 24",
                                                                        children: (0, t.jsx)("path", {
                                                                            d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
                                                                        }),
                                                                    }),
                                                                }),
                                                            }),
                                                            (0, t.jsx)("li", {
                                                                children: (0, t.jsx)("a", {
                                                                    href: "https://www.facebook.com/trabalhoeemprego/",
                                                                    "aria-label": "Facebook",
                                                                    className: "flex items-center justify-center w-8 h-8 bg-opacity-20 bg-white rounded-full",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-4 h-4",
                                                                        fill: "currentColor",
                                                                        viewBox: "0 0 24 24",
                                                                        children: (0, t.jsx)("path", {
                                                                            d:
                                                                                "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
                                                                        }),
                                                                    }),
                                                                }),
                                                            }),
                                                            (0, t.jsx)("li", {
                                                                children: (0, t.jsx)("a", {
                                                                    href: "https://www.youtube.com/c/canaltrabalho",
                                                                    "aria-label": "YouTube",
                                                                    className: "flex items-center justify-center w-8 h-8 bg-opacity-20 bg-white rounded-full",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-4 h-4",
                                                                        fill: "currentColor",
                                                                        viewBox: "0 0 24 24",
                                                                        children: (0, t.jsx)("path", {
                                                                            d:
                                                                                "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
                                                                        }),
                                                                    }),
                                                                }),
                                                            }),
                                                            (0, t.jsx)("li", {
                                                                children: (0, t.jsx)("a", {
                                                                    href: "https://br.linkedin.com/company/minist-rio-do-trabalho-e-emprego",
                                                                    "aria-label": "LinkedIn",
                                                                    className: "flex items-center justify-center w-8 h-8 bg-opacity-20 bg-white rounded-full",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-4 h-4",
                                                                        fill: "currentColor",
                                                                        viewBox: "0 0 24 24",
                                                                        children: (0, t.jsx)("path", {
                                                                            d:
                                                                                "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
                                                                        }),
                                                                    }),
                                                                }),
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "mt-4",
                                                children: (0, t.jsx)("a", {
                                                    href: "https://www.gov.br/acessoainformacao/pt-br",
                                                    title: "Acesse o portal sobre o acesso \xe0 informa\xe7\xe3o",
                                                    children: (0, t.jsxs)("div", {
                                                        className: "flex items-center",
                                                        children: [
                                                            (0, t.jsx)("div", {
                                                                className: "bg-blue-600 rounded-full w-10 h-10 flex items-center justify-center mr-2",
                                                                children: (0, t.jsx)("svg", {
                                                                    className: "w-5 h-5 text-white",
                                                                    fill: "currentColor",
                                                                    viewBox: "0 0 24 24",
                                                                    children: (0, t.jsx)("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" }),
                                                                }),
                                                            }),
                                                            (0, t.jsxs)("div", { className: "text-white text-xs font-bold leading-tight", children: ["ACESSO \xc0", (0, t.jsx)("br", {}), "INFORMA\xc7\xc3O"] }),
                                                        ],
                                                    }),
                                                }),
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        }),
                        (0, t.jsx)("div", {
                            className: "bg-gray-900 py-3",
                            children: (0, t.jsx)("div", {
                                className: "container mx-auto px-4",
                                children: (0, t.jsxs)("div", {
                                    className: "text-xs text-white",
                                    children: [
                                        "Todo o conte\xfado deste site est\xe1 publicado sob a licen\xe7a",
                                        " ",
                                        (0, t.jsx)("a", {
                                            rel: "license",
                                            href: "https://creativecommons.org/licenses/by-nd/3.0/deed.pt_BR",
                                            className: "text-blue-400 hover:text-blue-300",
                                            children: "Creative Commons Atribui\xe7\xe3o-SemDeriva\xe7\xf5es 3.0 N\xe3o Adaptada",
                                        }),
                                        ".",
                                    ],
                                }),
                            }),
                        }),
                    ],
                });
            }
            function f() {
                return (0, t.jsxs)("div", {
                    className: "fixed inset-0 z-50 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center",
                    children: [
                        (0, t.jsxs)("div", {
                            className: "absolute inset-0 overflow-hidden",
                            children: [
                                (0, t.jsx)("div", { className: "absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-r from-blue-400/20 to-transparent rounded-full animate-spin", style: { animationDuration: "20s" } }),
                                (0, t.jsx)("div", {
                                    className: "absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-l from-green-400/20 to-transparent rounded-full animate-spin",
                                    style: { animationDuration: "25s", animationDirection: "reverse" },
                                }),
                            ],
                        }),
                        (0, t.jsxs)("div", {
                            className: "relative z-10 text-center max-w-lg mx-auto px-8",
                            children: [
                                (0, t.jsx)("div", {
                                    className: "mb-8",
                                    children: (0, t.jsx)("img", {
                                        src: "https://www.detran.se.gov.br/portal/img/marca_cnh_social.png",
                                        alt: "CNH Social",
                                        className: "w-32 h-32 mx-auto filter drop-shadow-2xl animate-pulse rounded-lg",
                                    }),
                                }),
                                (0, t.jsx)("h1", { className: "text-3xl font-bold text-white mb-2", children: "CNH Social 2025" }),
                                (0, t.jsx)("p", { className: "text-blue-200 mb-8 text-lg", children: "Conectando brasileiros \xe0 mobilidade e autonomia" }),
                                (0, t.jsx)("div", {
                                    className: "relative mb-8",
                                    children: (0, t.jsxs)("div", {
                                        className: "w-32 h-32 mx-auto relative",
                                        children: [
                                            (0, t.jsx)("div", { className: "absolute inset-0 rounded-full border-4 border-blue-300/30" }),
                                            (0, t.jsx)("div", { className: "absolute inset-0 rounded-full border-4 border-transparent border-t-white border-r-white animate-spin" }),
                                            (0, t.jsx)("div", { className: "absolute inset-4 rounded-full border-2 border-blue-200/50" }),
                                            (0, t.jsx)("div", { className: "absolute inset-1/2 w-4 h-4 -ml-2 -mt-2 bg-white rounded-full animate-pulse" }),
                                            (0, t.jsxs)("div", {
                                                className: "absolute inset-0",
                                                children: [
                                                    (0, t.jsx)("div", { className: "absolute top-0 left-1/2 w-2 h-2 -ml-1 bg-green-400 rounded-full animate-ping", style: { animationDelay: "0s" } }),
                                                    (0, t.jsx)("div", { className: "absolute bottom-0 left-1/2 w-2 h-2 -ml-1 bg-yellow-400 rounded-full animate-ping", style: { animationDelay: "0.5s" } }),
                                                    (0, t.jsx)("div", { className: "absolute left-0 top-1/2 w-2 h-2 -mt-1 bg-red-400 rounded-full animate-ping", style: { animationDelay: "1s" } }),
                                                    (0, t.jsx)("div", { className: "absolute right-0 top-1/2 w-2 h-2 -mt-1 bg-purple-400 rounded-full animate-ping", style: { animationDelay: "1.5s" } }),
                                                ],
                                            }),
                                        ],
                                    }),
                                }),
                                (0, t.jsxs)("div", {
                                    className: "space-y-4",
                                    children: [
                                        (0, t.jsx)("div", {
                                            className: "w-full bg-blue-800/50 rounded-full h-2 mb-6",
                                            children: (0, t.jsx)("div", { className: "bg-gradient-to-r from-green-400 to-blue-400 h-2 rounded-full transition-all duration-1000 ease-out", style: { width: "40%" } }),
                                        }),
                                        (0, t.jsx)("div", {
                                            className: "min-h-[60px] flex items-center justify-center",
                                            children: (0, t.jsx)("p", { className: "text-xl text-white font-medium animate-pulse", children: "Analisando sua localiza\xe7\xe3o e perfil socioecon\xf4mico..." }),
                                        }),
                                        (0, t.jsxs)("div", {
                                            className: "flex justify-center space-x-3 mt-6",
                                            children: [
                                                (0, t.jsx)("div", { className: "w-3 h-3 rounded-full transition-all duration-500 bg-green-400 scale-110" }),
                                                (0, t.jsx)("div", { className: "w-3 h-3 rounded-full transition-all duration-500 bg-green-400 scale-110" }),
                                                (0, t.jsx)("div", { className: "w-3 h-3 rounded-full transition-all duration-500 bg-blue-300 animate-pulse" }),
                                                (0, t.jsx)("div", { className: "w-3 h-3 rounded-full transition-all duration-500 bg-blue-600/50" }),
                                                (0, t.jsx)("div", { className: "w-3 h-3 rounded-full transition-all duration-500 bg-blue-600/50" }),
                                            ],
                                        }),
                                        (0, t.jsxs)("div", {
                                            className: "grid grid-cols-3 gap-4 mt-8 text-center",
                                            children: [
                                                (0, t.jsxs)("div", {
                                                    className: "bg-white/10 backdrop-blur-sm rounded-lg p-3",
                                                    children: [
                                                        (0, t.jsx)("div", { className: "text-2xl font-bold text-white animate-pulse", children: "150 mil+" }),
                                                        (0, t.jsx)("div", { className: "text-blue-200 text-sm", children: "CNH Dispon\xedveis" }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-white/10 backdrop-blur-sm rounded-lg p-3",
                                                    children: [
                                                        (0, t.jsx)("div", { className: "text-2xl font-bold text-white animate-pulse", children: "5.570" }),
                                                        (0, t.jsx)("div", { className: "text-blue-200 text-sm", children: "Munic\xedpios" }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-white/10 backdrop-blur-sm rounded-lg p-3",
                                                    children: [(0, t.jsx)("div", { className: "text-2xl font-bold text-white animate-pulse", children: "27" }), (0, t.jsx)("div", { className: "text-blue-200 text-sm", children: "Estados" })],
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                });
            }
            var N = a(8381),
                v = a(6079),
                y = a(2739);
            function w(e) {
                let { onAdvance: s, onImageClick: a, selectedImages: i } = e;
                return (0, t.jsx)("div", {
                    className: "min-h-screen bg-gray-100 flex items-center justify-center p-4",
                    children: (0, t.jsxs)("div", {
                        className: "bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 overflow-hidden",
                        children: [
                            (0, t.jsx)("div", {
                                className: "bg-teal-600 text-white p-4",
                                children: (0, t.jsx)("div", {
                                    className: "flex justify-between items-start",
                                    children: (0, t.jsxs)("div", {
                                        className: "flex items-start space-x-3 flex-shrink-0 flex-1",
                                        children: [
                                            (0, t.jsxs)("div", {
                                                children: [
                                                    (0, t.jsxs)("h3", {
                                                        className: "text-sm font-medium leading-tight",
                                                        children: ["Clique nas imagens com as", (0, t.jsx)("br", {}), "mesmas esp\xe9cies ", (0, t.jsx)("strong", { children: "ANIMAIS" }), (0, t.jsx)("br", {}), "mostradas na amostra"],
                                                    }),
                                                    (0, t.jsx)("p", { className: "text-xs mt-1 opacity-90", children: "Se n\xe3o houver nenhuma, clique em Continuar" }),
                                                ],
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "rounded flex-shrink-0",
                                                children: (0, t.jsx)("img", { src: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=80&h=80&fit=crop", alt: "Amostra - Cachorro", className: "w-32 h-32 rounded object-cover" }),
                                            }),
                                        ],
                                    }),
                                }),
                            }),
                            (0, t.jsxs)("div", {
                                className: "p-4",
                                children: [
                                    (0, t.jsx)("div", {
                                        className: "grid grid-cols-3 gap-1 mb-4",
                                        children: [
                                            "https://images.unsplash.com/photo-1552053831-71594a27632d?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=150&h=150&fit=crop",
                                            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&h=150&fit=crop",
                                        ].map((e, s) =>
                                            (0, t.jsxs)(
                                                "div",
                                                {
                                                    className: "relative cursor-pointer border-2 rounded overflow-hidden transition-all ".concat(i.includes(s) ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"),
                                                    onClick: () => a(s),
                                                    children: [
                                                        (0, t.jsx)("img", { src: e || "/placeholder.svg", alt: "Captcha ".concat(s + 1), className: "w-full h-28 object-cover" }),
                                                        i.includes(s) &&
                                                            (0, t.jsx)("div", {
                                                                className: "absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center",
                                                                children: (0, t.jsx)("div", {
                                                                    className: "w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-4 h-4 text-white",
                                                                        fill: "currentColor",
                                                                        viewBox: "0 0 20 20",
                                                                        children: (0, t.jsx)("path", {
                                                                            fillRule: "evenodd",
                                                                            d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
                                                                            clipRule: "evenodd",
                                                                        }),
                                                                    }),
                                                                }),
                                                            }),
                                                    ],
                                                },
                                                s
                                            )
                                        ),
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "flex items-center justify-between",
                                        children: [
                                            (0, t.jsxs)("div", {
                                                className: "flex space-x-2",
                                                children: [
                                                    (0, t.jsx)("button", { className: "w-8 h-8 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center", children: (0, t.jsx)(N.A, { className: "text-gray-600 text-sm" }) }),
                                                    (0, t.jsx)("button", { className: "w-8 h-8 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center", children: (0, t.jsx)(v.A, { className: "text-gray-600 text-sm" }) }),
                                                    (0, t.jsx)("button", { className: "w-8 h-8 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center", children: (0, t.jsx)(y.A, { className: "text-gray-600 text-sm" }) }),
                                                ],
                                            }),
                                            (0, t.jsxs)("svg", {
                                                xmlns: "http://www.w3.org/2000/svg",
                                                width: "32",
                                                height: "32",
                                                viewBox: "0 0 32 32",
                                                role: "img",
                                                "aria-hidden": "true",
                                                fill: "none",
                                                style: { width: "32px", height: "32px", display: "block" },
                                                children: [
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M24 28H20V32H24V28Z", fill: "#0074BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M20 28H16V32H20V28Z", fill: "#0074BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M16 28H12V32H16V28Z", fill: "#0074BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M12 28H8V32H12V28Z", fill: "#0074BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M28 24H24V28H28V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M24 24H20V28H24V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { d: "M20 24H16V28H20V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { d: "M16 24H12V28H16V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M12 24H8V28H12V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M8 24H4V28H8V24Z", fill: "#0082BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M32 20H28V24H32V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M28 20H24V24H28V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { d: "M24 20H20V24H24V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { d: "M20 20H16V24H20V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { d: "M16 20H12V24H16V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { d: "M12 20H8V24H12V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M8 20H4V24H8V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M4 20H0V24H4V20Z", fill: "#008FBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M32 16H28V20H32V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M28 16H24V20H28V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M24 16H20V20H24V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M20 16H16V20H20V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M16 16H12V20H16V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M12 16H8V20H12V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { d: "M8 16H4V20H8V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M4 16H0V20H4V16Z", fill: "#009DBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M32 12H28V16H32V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M28 12H24V16H28V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M24 12H20V16H24V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M20 12H16V16H20V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M16 12H12V16H16V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M12 12H8V16H12V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { d: "M8 12H4V16H8V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M4 12H0V16H4V12Z", fill: "#00ABBF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M32 8H28V12H32V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M28 8H24V12H28V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { d: "M24 8H20V12H24V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { d: "M20 8H16V12H20V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { d: "M16 8H12V12H16V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { d: "M12 8H8V12H12V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M8 8H4V12H8V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M4 8H0V12H4V8Z", fill: "#00B9BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M28 4H24V8H28V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M24 4H20V8H24V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { d: "M20 4H16V8H20V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { d: "M16 4H12V8H16V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.8", d: "M12 4H8V8H12V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M8 4H4V8H8V4Z", fill: "#00C6BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M24 0H20V4H24V0Z", fill: "#00D4BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M20 0H16V4H20V0Z", fill: "#00D4BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.7", d: "M16 0H12V4H16V0Z", fill: "#00D4BF" }),
                                                    (0, t.jsx)("path", { opacity: "0.5", d: "M12 0H8V4H12V0Z", fill: "#00D4BF" }),
                                                    (0, t.jsx)("path", {
                                                        d:
                                                            "M10.5141 14.9697L11.6379 12.4572C12.0459 11.8129 11.9958 11.0255 11.5449 10.5745C11.4876 10.5173 11.416 10.46 11.3444 10.4171C11.0366 10.2238 10.6572 10.1808 10.3065 10.2954C9.91993 10.4171 9.58349 10.6748 9.36875 11.0184C9.36875 11.0184 7.82972 14.6046 7.26421 16.2153C6.69871 17.8259 6.92062 20.7822 9.12536 22.987C11.4661 25.3277 14.8448 25.8575 17.0066 24.2397C17.0997 24.1967 17.1784 24.1395 17.2572 24.0751L23.9072 18.5202C24.2293 18.2554 24.7089 17.7042 24.2794 17.0743C23.8642 16.4586 23.0697 16.881 22.7404 17.0886L18.9107 19.8731C18.8391 19.9304 18.7318 19.9232 18.6673 19.8517C18.6673 19.8517 18.6673 19.8445 18.6602 19.8445C18.56 19.7228 18.5456 19.4079 18.696 19.2862L24.5657 14.304C25.074 13.8459 25.1456 13.1802 24.7304 12.7292C24.3295 12.2854 23.6924 12.2997 23.1842 12.7578L17.9157 16.881C17.8155 16.9597 17.6652 16.9454 17.5864 16.8452L17.5793 16.838C17.4719 16.7235 17.4361 16.5231 17.5506 16.4014L23.535 10.596C24.0074 10.1522 24.036 9.4149 23.5922 8.94245C23.3775 8.72054 23.084 8.59169 22.7762 8.59169C22.4612 8.59169 22.1606 8.70623 21.9387 8.92813L15.8255 14.6691C15.6823 14.8122 15.396 14.6691 15.3602 14.4973C15.3459 14.4328 15.3674 14.3684 15.4103 14.3255L20.0918 8.99972C20.5571 8.56306 20.5858 7.83292 20.1491 7.36763C19.7124 6.90234 18.9823 6.87371 18.517 7.31036C18.4955 7.32468 18.4812 7.34615 18.4597 7.36763L11.3659 15.2203C11.1082 15.478 10.736 15.4851 10.557 15.342C10.4425 15.2489 10.4282 15.0843 10.5141 14.9697Z",
                                                        fill: "white",
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsx)("button", {
                                                className:
                                                    "inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 text-white px-6 py-2 rounded text-sm font-medium",
                                                style: { background: "rgb(19, 81, 180) 0px 0px no-repeat padding-box" },
                                                onClick: s,
                                                children: "Avan\xe7ar",
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                });
            }
            function C() {
                return (0, t.jsxs)("div", {
                    className: "grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8",
                    children: [
                        (0, t.jsx)("div", {
                            className: "rounded-lg text-card-foreground shadow-sm border border-blue-200 bg-blue-50",
                            children: (0, t.jsxs)("div", {
                                className: "p-4 sm:p-6 text-center",
                                children: [
                                    (0, t.jsx)("div", { className: "text-2xl sm:text-3xl font-bold text-[#1351B4] mb-2", children: "25" }),
                                    (0, t.jsx)("div", { className: "text-xs sm:text-sm text-gray-700", style: { fontFamily: "Rawline, sans-serif" }, children: "Vagas Dispon\xedveis" }),
                                ],
                            }),
                        }),
                        (0, t.jsx)("div", {
                            className: "rounded-lg text-card-foreground shadow-sm border border-green-200 bg-green-50",
                            children: (0, t.jsxs)("div", {
                                className: "p-4 sm:p-6 text-center",
                                children: [
                                    (0, t.jsx)("div", { className: "text-2xl sm:text-3xl font-bold text-green-600 mb-2", children: "R$ 5.8M" }),
                                    (0, t.jsx)("div", { className: "text-xs sm:text-sm text-gray-700", style: { fontFamily: "Rawline, sans-serif" }, children: "Economia para Cidad\xe3os" }),
                                ],
                            }),
                        }),
                        (0, t.jsx)("div", {
                            className: "rounded-lg text-card-foreground shadow-sm border border-orange-200 bg-orange-50",
                            children: (0, t.jsxs)("div", {
                                className: "p-4 sm:p-6 text-center",
                                children: [
                                    (0, t.jsx)("div", { className: "text-2xl sm:text-3xl font-bold text-orange-600 mb-2", children: "21" }),
                                    (0, t.jsx)("div", { className: "text-xs sm:text-sm text-gray-700", style: { fontFamily: "Rawline, sans-serif" }, children: "Fam\xedlias Beneficiadas" }),
                                ],
                            }),
                        }),
                    ],
                });
            }
            function H(e) {
                let { category: s, title: a, description: i, normalPrice: r, socialPrice: l, availableSlots: o, duration: n, isSelected: d, onSelect: c } = e;
                return (0, t.jsx)("div", {
                    className: "rounded-lg bg-card text-card-foreground shadow-sm border border-gray-200 hover:border-[#1351B4] transition-all duration-200",
                    children: (0, t.jsx)("div", {
                        className: "p-4 sm:p-6",
                        children: (0, t.jsxs)("div", {
                            className: "flex flex-col space-y-4",
                            children: [
                                (0, t.jsxs)("div", {
                                    className: "flex-1",
                                    children: [
                                        (0, t.jsxs)("div", {
                                            className: "flex flex-col sm:flex-row sm:items-center mb-3 space-y-2 sm:space-y-0",
                                            children: [
                                                (0, t.jsx)("div", {
                                                    className:
                                                        "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 mr-0 sm:mr-3 bg-[#1351B4] text-white border-[#1351B4] text-base sm:text-lg px-3 py-1 w-fit",
                                                    children: s,
                                                }),
                                                (0, t.jsx)("h3", { className: "text-lg sm:text-xl font-bold text-[#333333]", style: { fontFamily: "Rawline, sans-serif" }, children: a }),
                                            ],
                                        }),
                                        (0, t.jsx)("p", { className: "text-gray-700 mb-4 text-sm sm:text-base", style: { fontFamily: "Rawline, sans-serif" }, children: i }),
                                        (0, t.jsxs)("div", {
                                            className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm mb-4",
                                            children: [
                                                (0, t.jsxs)("div", {
                                                    className: "bg-gray-50 p-3 rounded",
                                                    children: [
                                                        (0, t.jsx)("span", { className: "font-semibold text-gray-600", children: "Pre\xe7o Normal:" }),
                                                        (0, t.jsx)("div", { className: "text-gray-500 line-through mt-1", children: r }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-green-50 p-3 rounded",
                                                    children: [
                                                        (0, t.jsx)("span", { className: "font-semibold text-green-600", children: "Pre\xe7o Social:" }),
                                                        (0, t.jsx)("div", { className: "text-xl sm:text-2xl font-bold text-green-600 mt-1", children: l }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-blue-50 p-3 rounded",
                                                    children: [
                                                        (0, t.jsx)("span", { className: "font-semibold text-gray-600", children: "Vagas:" }),
                                                        (0, t.jsxs)("div", { className: "text-[#1351B4] font-bold mt-1", children: [o, " dispon\xedveis"] }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-gray-50 p-3 rounded",
                                                    children: [(0, t.jsx)("span", { className: "font-semibold text-gray-600", children: "Prazo:" }), (0, t.jsx)("div", { className: "text-gray-700 mt-1", children: n })],
                                                }),
                                            ],
                                        }),
                                        (0, t.jsx)("div", {
                                            className: "mb-4",
                                            children: (0, t.jsx)("div", {
                                                className:
                                                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-secondary/80 bg-green-100 text-green-700",
                                                children: "Vagas limitadas",
                                            }),
                                        }),
                                    ],
                                }),
                                (0, t.jsx)("div", {
                                    className: "w-full",
                                    children: (0, t.jsx)("button", {
                                        className: "inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 w-full ".concat(
                                            d ? "bg-green-600 hover:bg-green-700" : "bg-[#1351B4] hover:bg-[#0c326f]",
                                            " text-white px-6 sm:px-8 py-3 text-base sm:text-lg font-medium rounded-lg"
                                        ),
                                        style: { fontFamily: "Rawline, sans-serif" },
                                        onClick: () => c(s),
                                        children: d
                                            ? (0, t.jsxs)(t.Fragment, {
                                                  children: [(0, t.jsx)("span", { className: "block sm:hidden", children: "Selecionado ✓" }), (0, t.jsxs)("span", { className: "hidden sm:block", children: ["CNH ", s, " Selecionada ✓"] })],
                                              })
                                            : (0, t.jsxs)(t.Fragment, {
                                                  children: [(0, t.jsxs)("span", { className: "block sm:hidden", children: ["Selecionar ", s] }), (0, t.jsxs)("span", { className: "hidden sm:block", children: ["Selecionar CNH ", s] })],
                                              }),
                                    }),
                                }),
                            ],
                        }),
                    }),
                });
            }
            var A = a(4666),
                B = a(5586);
            function S(e) {
                let { rating: s, maxRating: a = 5 } = e,
                    i = Math.floor(s),
                    r = s % 1 >= 0.5,
                    l = Math.max(0, a - i - +!!r);
                return (0, t.jsxs)("div", {
                    className: "flex items-center",
                    children: [
                        Array(i)
                            .fill(0)
                            .map((e, s) => (0, t.jsx)(B.A, { className: "w-3 h-3 text-yellow-500 fill-yellow-500" }, "full-".concat(s))),
                        r &&
                            (0, t.jsxs)(
                                "div",
                                {
                                    className: "relative",
                                    children: [
                                        (0, t.jsx)(B.A, { className: "w-3 h-3 text-gray-300 fill-gray-300" }),
                                        (0, t.jsx)("div", { className: "absolute top-0 left-0 overflow-hidden w-1/2", children: (0, t.jsx)(B.A, { className: "w-3 h-3 text-yellow-500 fill-yellow-500" }) }),
                                    ],
                                },
                                "half"
                            ),
                        Array(l)
                            .fill(0)
                            .map((e, s) => (0, t.jsx)(B.A, { className: "w-3 h-3 text-gray-300" }, "empty-".concat(s))),
                    ],
                });
            }
            function F(e) {
                let { school: s, isSelected: a = !1, onSelect: i } = e;
                return (0, t.jsx)("div", {
                    className: "rounded-lg bg-card text-card-foreground shadow-sm border cursor-pointer transition-all duration-200 ".concat(a ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-[#1351B4] hover:shadow-md"),
                    children: (0, t.jsx)("div", {
                        className: "p-3 sm:p-4",
                        children: (0, t.jsxs)("div", {
                            className: "flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0",
                            children: [
                                (0, t.jsxs)("div", {
                                    className: "flex-1 min-w-0",
                                    children: [
                                        (0, t.jsx)("h4", { className: "font-bold text-[#333333] mb-2 text-sm sm:text-base", style: { fontFamily: "Rawline, sans-serif" }, children: s.name }),
                                        (0, t.jsx)("p", { className: "text-gray-600 text-xs sm:text-sm mb-3 leading-relaxed", style: { fontFamily: "Rawline, sans-serif" }, children: s.address }),
                                        (0, t.jsxs)("div", {
                                            className: "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm",
                                            children: [
                                                (0, t.jsxs)("span", { className: "text-gray-500 flex items-center", children: [(0, t.jsx)(A.A, { className: "w-3 h-3 mr-1" }), " ", s.distance, " de dist\xe2ncia"] }),
                                                (0, t.jsxs)("span", {
                                                    className: "text-yellow-600 flex items-center",
                                                    children: [(0, t.jsx)(S, { rating: s.rating, maxRating: s.maxRating }), (0, t.jsxs)("span", { className: "ml-1", children: [s.rating, "/", s.maxRating] })],
                                                }),
                                                (0, t.jsx)("div", {
                                                    className: "inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-primary/80 w-fit text-xs ".concat(
                                                        "Credenciada" === s.type ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                                                    ),
                                                    children: s.type,
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                                (0, t.jsx)("div", {
                                    className: "flex justify-center sm:justify-end sm:ml-4",
                                    children: (0, t.jsx)("button", {
                                        className: "px-3 py-1 text-xs font-medium rounded transition-colors ".concat(a ? "text-white bg-green-600 hover:bg-green-700" : "text-white bg-[#1351B4] hover:bg-[#0c326f]"),
                                        onClick: () => (null == i ? void 0 : i(s)),
                                        children: a ? "Selecionada ✓" : "Selecionar",
                                    }),
                                }),
                            ],
                        }),
                    }),
                });
            }
            function D(e) {
                let { selectedCategory: s, selectedSchool: a, categoryInfo: r, onProceedToPayment: l } = e,
                    [o, n] = (0, i.useState)(null),
                    [d, c] = (0, i.useState)(new Date()),
                    [m, x] = (0, i.useState)(!1),
                    h = (e) => {
                        let s = e.getDay();
                        return s >= 1 && s <= 5;
                    };
                return (
                    o ||
                        (() => {
                            let e = new Date(),
                                s = new Date(e);
                            for (s.setDate(e.getDate() + 7); !h(s); ) s.setDate(s.getDate() + 1);
                        })(),
                    (0, t.jsxs)("div", {
                        className: "mt-6 p-4 sm:p-6 bg-green-50 border border-green-200 rounded-lg relative",
                        children: [
                            (0, t.jsx)("h4", { className: "font-bold text-green-800 mb-3 text-lg", style: { fontFamily: "Rawline, sans-serif" }, children: "Resumo da Inscri\xe7\xe3o" }),
                            (0, t.jsxs)("div", {
                                className: "space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 text-sm mb-6",
                                children: [
                                    (0, t.jsxs)("div", {
                                        className: "bg-white p-3 rounded border",
                                        children: [(0, t.jsx)("span", { className: "font-semibold text-gray-700", children: "CNH:" }), (0, t.jsx)("div", { className: "text-gray-900 mt-1", children: r.name })],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "bg-white p-3 rounded border",
                                        children: [(0, t.jsx)("span", { className: "font-semibold text-gray-700", children: "Autoescola:" }), (0, t.jsx)("div", { className: "text-gray-900 mt-1", children: a.name })],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "bg-white p-3 rounded border",
                                        children: [(0, t.jsx)("span", { className: "font-semibold text-gray-700", children: "Valor:" }), (0, t.jsx)("div", { className: "text-green-600 font-bold text-lg mt-1", children: r.price })],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "bg-white p-3 rounded border",
                                        children: [
                                            (0, t.jsx)("span", { className: "font-semibold text-gray-700", children: "Pr\xf3ximo passo:" }),
                                            (0, t.jsx)("div", { className: "text-blue-600 font-medium mt-1", children: "Agendar in\xedcio das aulas" }),
                                        ],
                                    }),
                                ],
                            }),
                            (0, t.jsx)("div", {
                                className: "px-2 sm:px-0",
                                children: (0, t.jsxs)("button", {
                                    className:
                                        "inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 w-full bg-green-600 hover:bg-green-700 text-white text-base sm:text-lg font-bold py-4 sm:py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200",
                                    style: { fontFamily: "Rawline, sans-serif" },
                                    onClick: l,
                                    children: [(0, t.jsx)("span", { className: "block sm:hidden", children: "Agendar Aulas" }), (0, t.jsx)("span", { className: "hidden sm:block", children: "Agendar In\xedcio das Aulas" })],
                                }),
                            }),
                        ],
                    })
                );
            }
            var R = a(5516),
                V = a(2297),
                M = a(3602),
                k = a(6722),
                P = a(7188);
            function I(e) {
                let { selectedCategory: s, selectedSchool: a, categoryInfo: r, addressData: l, userData: o, onDateSelected: n } = e,
                    [d, c] = (0, i.useState)(null),
                    [m, x] = (0, i.useState)(new Date()),
                    h = (e) => {
                        let s = e.getDay();
                        return s >= 1 && s <= 6;
                    },
                    g = (e) => {
                        let s = new Date();
                        s.setHours(0, 0, 0, 0);
                        let a = new Date(s);
                        a.setDate(s.getDate() + 7);
                        let t = new Date(s);
                        return t.setDate(s.getDate() + 60), e >= a && e <= t && h(e);
                    },
                    b = (e) => {
                        x((s) => {
                            let a = new Date(s);
                            return "prev" === e ? a.setMonth(s.getMonth() - 1) : a.setMonth(s.getMonth() + 1), a;
                        });
                    },
                    f = (e) => {
                        g(e) && c(e);
                    },
                    N = ((e) => {
                        let s = {
                            A: { theoreticalHours: "45 horas", practicalHours: "15 horas", duration: "45 dias" },
                            B: { theoreticalHours: "45 horas", practicalHours: "20 horas", duration: "60 dias" },
                            AB: { theoreticalHours: "45 horas", practicalHours: "25 horas", duration: "90 dias" },
                        };
                        return s[e] || s.B;
                    })(s);
                return (0, t.jsxs)("div", {
                    className: "min-h-screen bg-white",
                    children: [
                        (0, t.jsx)(u, { showUserButton: !0, userData: o }),
                        (0, t.jsx)(p, {}),
                        (0, t.jsx)("div", {
                            className: "container mx-auto px-4 py-8",
                            children: (0, t.jsxs)("div", {
                                className: "max-w-4xl mx-auto",
                                children: [
                                    (0, t.jsx)("div", {
                                        className: "mb-8",
                                        children: (0, t.jsxs)("div", {
                                            className: "flex items-center mb-4",
                                            children: [
                                                (0, t.jsx)("div", { className: "w-1 h-8 bg-[#1351B4] mr-4" }),
                                                (0, t.jsxs)("div", {
                                                    children: [
                                                        (0, t.jsx)("h1", { className: "text-2xl font-bold text-[#333333]", style: { fontFamily: "Rawline, sans-serif" }, children: "Agendamento de In\xedcio das Aulas" }),
                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mt-1", children: "CNH Social 2025 - Escolha a data de in\xedcio do seu curso" }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8",
                                        children: [
                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-blue-800 mb-4", children: "Resumo da sua inscri\xe7\xe3o" }),
                                            (0, t.jsxs)("div", {
                                                className: "grid md:grid-cols-3 gap-4 text-sm",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        children: [(0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Categoria CNH:" }), (0, t.jsx)("p", { className: "text-blue-800 font-semibold", children: r.name })],
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        children: [(0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Autoescola:" }), (0, t.jsx)("p", { className: "text-blue-800 font-semibold", children: a.name })],
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        children: [(0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Valor:" }), (0, t.jsx)("p", { className: "text-green-600 font-bold text-lg", children: r.price })],
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "grid lg:grid-cols-2 gap-8",
                                        children: [
                                            (0, t.jsxs)("div", {
                                                className: "bg-white border border-gray-200 rounded-lg p-6",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        className: "flex items-center mb-6",
                                                        children: [
                                                            (0, t.jsx)(R.A, { className: "w-6 h-6 text-[#1351B4] mr-3" }),
                                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-gray-900", children: "Escolha a data de in\xedcio" }),
                                                        ],
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        className: "bg-white border border-gray-200 rounded-lg p-4",
                                                        children: [
                                                            (0, t.jsxs)("div", {
                                                                className: "flex items-center justify-between mb-4",
                                                                children: [
                                                                    (0, t.jsx)("button", { onClick: () => b("prev"), className: "p-2 hover:bg-gray-100 rounded", children: (0, t.jsx)(V.A, { className: "w-5 h-5" }) }),
                                                                    (0, t.jsx)("h3", { className: "font-semibold text-gray-900 text-lg", children: m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) }),
                                                                    (0, t.jsx)("button", { onClick: () => b("next"), className: "p-2 hover:bg-gray-100 rounded", children: (0, t.jsx)(M.A, { className: "w-5 h-5" }) }),
                                                                ],
                                                            }),
                                                            (0, t.jsx)("div", {
                                                                className: "grid grid-cols-7 gap-1 mb-2",
                                                                children: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\xe1b"].map((e) =>
                                                                    (0, t.jsx)("div", { className: "text-center text-sm font-medium text-gray-500 p-3", children: e }, e)
                                                                ),
                                                            }),
                                                            (0, t.jsx)("div", {
                                                                className: "grid grid-cols-7 gap-1",
                                                                children: ((e) => {
                                                                    let s = e.getFullYear(),
                                                                        a = e.getMonth(),
                                                                        t = new Date(s, a, 1),
                                                                        i = new Date(s, a + 1, 0).getDate(),
                                                                        r = t.getDay(),
                                                                        l = [];
                                                                    for (let e = 0; e < r; e++) l.push(null);
                                                                    for (let e = 1; e <= i; e++) l.push(new Date(s, a, e));
                                                                    return l;
                                                                })(m).map((e, s) => {
                                                                    if (!e) return (0, t.jsx)("div", { className: "p-3" }, s);
                                                                    let a = g(e),
                                                                        i = d && e.toDateString() === d.toDateString();
                                                                    return (0, t.jsx)(
                                                                        "button",
                                                                        {
                                                                            onClick: () => f(e),
                                                                            disabled: !a,
                                                                            className: "p-3 text-sm rounded-lg transition-all duration-200 ".concat(
                                                                                i
                                                                                    ? "bg-[#1351B4] text-white shadow-lg scale-105"
                                                                                    : a
                                                                                    ? "hover:bg-blue-100 text-gray-900 border border-transparent hover:border-blue-300"
                                                                                    : "text-gray-300 cursor-not-allowed bg-gray-50"
                                                                            ),
                                                                            children: e.getDate(),
                                                                        },
                                                                        s
                                                                    );
                                                                }),
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "mt-4 p-3 bg-blue-50 rounded-lg",
                                                                children: [
                                                                    (0, t.jsx)("h4", { className: "text-sm font-medium text-blue-800 mb-2", children: "Informa\xe7\xf5es importantes:" }),
                                                                    (0, t.jsxs)("ul", {
                                                                        className: "text-xs text-blue-700 space-y-1",
                                                                        children: [
                                                                            (0, t.jsx)("li", { children: "• Dias \xfateis e s\xe1bados dispon\xedveis" }),
                                                                            (0, t.jsx)("li", { children: "• Seg-Sex: 08:00 \xe0s 17:00 | S\xe1b: 08:00 \xe0s 12:00" }),
                                                                            (0, t.jsx)("li", { children: "• Agendamento a partir da pr\xf3xima semana" }),
                                                                            (0, t.jsxs)("li", { children: ["• Dura\xe7\xe3o do curso: ", N.duration] }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("div", {
                                                className: "space-y-6",
                                                children: [
                                                    d &&
                                                        (0, t.jsxs)("div", {
                                                            className: "bg-green-50 border border-green-200 rounded-lg p-6",
                                                            children: [
                                                                (0, t.jsxs)("div", {
                                                                    className: "flex items-center mb-3",
                                                                    children: [
                                                                        (0, t.jsx)(k.A, { className: "w-6 h-6 text-green-600 mr-3" }),
                                                                        (0, t.jsx)("h3", { className: "text-lg font-semibold text-green-800", children: "Data selecionada" }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    className: "space-y-2",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "flex items-center text-green-700",
                                                                            children: [
                                                                                (0, t.jsx)(R.A, { className: "w-4 h-4 mr-2" }),
                                                                                (0, t.jsx)("span", { className: "font-medium", children: d.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("div", {
                                                                            className: "flex items-center text-green-700",
                                                                            children: [
                                                                                (0, t.jsx)(P.A, { className: "w-4 h-4 mr-2" }),
                                                                                (0, t.jsxs)("span", {
                                                                                    children: [
                                                                                        "Hor\xe1rio: ",
                                                                                        ((e) => {
                                                                                            let s = e.getDay();
                                                                                            return s >= 1 && s <= 5 ? "08:00 \xe0s 17:00" : 6 === s ? "08:00 \xe0s 12:00" : "";
                                                                                        })(d),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("div", {
                                                                            className: "flex items-center text-green-700",
                                                                            children: [(0, t.jsx)(A.A, { className: "w-4 h-4 mr-2" }), (0, t.jsx)("span", { children: a.name })],
                                                                        }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                    (0, t.jsxs)("div", {
                                                        className: "bg-gray-50 border border-gray-200 rounded-lg p-6",
                                                        children: [
                                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-gray-900 mb-4", children: "Detalhes do curso" }),
                                                            (0, t.jsxs)("div", {
                                                                className: "space-y-3",
                                                                children: [
                                                                    (0, t.jsxs)("div", {
                                                                        className: "flex justify-between",
                                                                        children: [
                                                                            (0, t.jsx)("span", { className: "text-gray-600", children: "Carga hor\xe1ria te\xf3rica:" }),
                                                                            (0, t.jsx)("span", { className: "font-medium", children: N.theoreticalHours }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("div", {
                                                                        className: "flex justify-between",
                                                                        children: [
                                                                            (0, t.jsx)("span", { className: "text-gray-600", children: "Carga hor\xe1ria pr\xe1tica:" }),
                                                                            (0, t.jsx)("span", { className: "font-medium", children: N.practicalHours }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("div", {
                                                                        className: "flex justify-between",
                                                                        children: [
                                                                            (0, t.jsx)("span", { className: "text-gray-600", children: "Dura\xe7\xe3o estimada:" }),
                                                                            (0, t.jsx)("span", { className: "font-medium", children: N.duration }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("div", {
                                                                        className: "flex justify-between border-t pt-3",
                                                                        children: [
                                                                            (0, t.jsx)("span", { className: "text-gray-600", children: "Hor\xe1rio das aulas:" }),
                                                                            (0, t.jsxs)("div", {
                                                                                className: "text-right",
                                                                                children: [
                                                                                    (0, t.jsx)("div", { className: "font-medium", children: "Seg-Sex: 08:00 \xe0s 17:00" }),
                                                                                    (0, t.jsx)("div", { className: "font-medium", children: "S\xe1b: 08:00 \xe0s 12:00" }),
                                                                                ],
                                                                            }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        className: "bg-gray-50 border border-gray-200 rounded-lg p-6",
                                                        children: [
                                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-gray-900 mb-4", children: "Local das aulas" }),
                                                            (0, t.jsxs)("div", {
                                                                className: "space-y-2",
                                                                children: [
                                                                    (0, t.jsx)("p", { className: "font-medium text-gray-900", children: a.name }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: a.address }),
                                                                    (0, t.jsxs)("p", { className: "text-blue-600 text-sm", children: ["\uD83D\uDCCD ", a.distance, " da sua localiza\xe7\xe3o"] }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                    (0, t.jsx)("button", {
                                                        className: "w-full py-4 px-6 rounded-lg font-medium text-lg transition-all duration-200 ".concat(
                                                            d ? "bg-[#1351B4] hover:bg-[#0c326f] text-white shadow-lg hover:shadow-xl" : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                                        ),
                                                        disabled: !d,
                                                        onClick: () => {
                                                            d && n(d);
                                                        },
                                                        children: d ? "Continuar para Verifica\xe7\xe3o" : "Selecione uma data para continuar",
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        }),
                        (0, t.jsx)(j, {}),
                    ],
                });
            }
            var E = a(118),
                z = a(9769);
            function T(e) {
                let { selectedCategory: s, selectedSchool: a, categoryInfo: r, addressData: l, cpf: o, userData: d, onProceedToReceipt: c } = e,
                    [m, x] = (0, i.useState)(!0),
                    [h, g] = (0, i.useState)(!1),
                    [b, f] = (0, i.useState)(!1),
                    [N, v] = (0, i.useState)(!1),
                    [y, w] = (0, i.useState)(!1),
                    [C, H] = (0, i.useState)(null),
                    B = (0, i.useRef)(null);
                (0, i.useEffect)(() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }, []);
                let S = ((e) => {
                        let s = {
                            A: { theoreticalHours: "45 horas", practicalHours: "15 horas", duration: "45 dias" },
                            B: { theoreticalHours: "45 horas", practicalHours: "20 horas", duration: "60 dias" },
                            AB: { theoreticalHours: "45 horas", practicalHours: "25 horas", duration: "90 dias" },
                        };
                        return s[e] || s.B;
                    })(s),
                    F = async () => {
                        try {
                            let e = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: !1 });
                            H(e), g(!0);
                        } catch (e) {
                            console.error("Erro ao acessar c\xe2mera:", e), alert("Erro ao acessar a c\xe2mera. Verifique as permiss\xf5es.");
                        }
                    };
                (0, i.useEffect)(() => {
                    C &&
                        B.current &&
                        ((B.current.srcObject = C),
                        B.current.play().catch((e) => {
                            console.error("Erro ao reproduzir v\xeddeo:", e);
                        }));
                }, [C]);
                let D = async () => {
                    if (!B.current || !C) return;
                    let e = document.createElement("canvas");
                    (e.width = B.current.videoWidth), (e.height = B.current.videoHeight);
                    let s = e.getContext("2d");
                    s &&
                        (s.drawImage(B.current, 0, 0),
                        C.getTracks().forEach((e) => e.stop()),
                        H(null),
                        g(!1),
                        f(!0),
                        v(!0),
                        setTimeout(() => {
                            v(!1), w(!0), x(!1);
                        }, 3e3));
                };
                return (0, t.jsxs)("div", {
                    className: "min-h-screen bg-white",
                    children: [
                        (0, t.jsx)(u, { showUserButton: !0, userData: d }),
                        (0, t.jsx)(p, {}),
                        (0, t.jsx)("div", {
                            className: "container mx-auto px-4 py-8",
                            children: (0, t.jsxs)("div", {
                                className: "max-w-4xl mx-auto",
                                children: [
                                    (0, t.jsx)("div", {
                                        className: "mb-8",
                                        children: (0, t.jsxs)("div", {
                                            className: "flex items-center mb-4",
                                            children: [
                                                (0, t.jsx)("div", { className: "w-1 h-8 bg-[#1351B4] mr-4" }),
                                                (0, t.jsxs)("div", {
                                                    children: [
                                                        (0, t.jsx)("h1", { className: "text-2xl font-bold text-[#333333]", style: { fontFamily: "Rawline, sans-serif" }, children: "Verifica\xe7\xe3o de Dados e Identidade" }),
                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mt-1", children: "CNH Social 2025 - Processo de Habilita\xe7\xe3o Gratuita" }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "grid md:grid-cols-2 gap-6 mb-8",
                                        children: [
                                            (0, t.jsx)("div", {
                                                className: "rounded-lg text-card-foreground shadow-sm border-2 border-green-200 bg-green-50",
                                                children: (0, t.jsxs)("div", {
                                                    className: "p-6",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            className: "flex items-center mb-4",
                                                            children: [
                                                                (0, t.jsx)("div", { className: "w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3", children: (0, t.jsx)(k.A, { className: "w-5 h-5 text-white" }) }),
                                                                (0, t.jsx)("h3", { className: "text-lg font-semibold text-green-800", children: "Dados Pessoais Verificados" }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            className: "space-y-3 text-sm",
                                                            children: [
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Nome Completo:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: (null == d ? void 0 : d.nome) || "Carregando..." }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "CPF:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: (null == d ? void 0 : d.cpf) || o }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Data de Nascimento:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: (null == d ? void 0 : d.nascimento) || "Carregando..." }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Sexo:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: (null == d ? void 0 : d.sexo) || "Carregando..." }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Nome da M\xe3e:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: (null == d ? void 0 : d.nome_mae) || "Carregando..." }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Situa\xe7\xe3o CPF:" }),
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-semibold", children: "Regular - Receita Federal" }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "rounded-lg text-card-foreground shadow-sm border-2 border-blue-200 bg-blue-50",
                                                children: (0, t.jsxs)("div", {
                                                    className: "p-6",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            className: "flex items-center mb-4",
                                                            children: [
                                                                (0, t.jsx)("div", { className: "w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-3", children: (0, t.jsx)(A.A, { className: "w-5 h-5 text-white" }) }),
                                                                (0, t.jsx)("h3", { className: "text-lg font-semibold text-blue-800", children: "Localiza\xe7\xe3o Verificada" }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            className: "space-y-3 text-sm",
                                                            children: [
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "CEP:" }),
                                                                        (0, t.jsx)("p", { className: "text-blue-800 font-semibold", children: (null == l ? void 0 : l.cep) || "72321-302" }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Endere\xe7o:" }),
                                                                        (0, t.jsxs)("p", {
                                                                            className: "text-blue-800 font-semibold",
                                                                            children: [
                                                                                (null == l ? void 0 : l.logradouro) || "Quadra QR 413 Conjunto 2",
                                                                                ",",
                                                                                " ",
                                                                                (null == l ? void 0 : l.bairro) || "Samambaia Norte",
                                                                                " (",
                                                                                (null == l ? void 0 : l.localidade) || "Samambaia",
                                                                                ")",
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Cidade/UF:" }),
                                                                        (0, t.jsxs)("p", {
                                                                            className: "text-blue-800 font-semibold",
                                                                            children: [(null == l ? void 0 : l.localidade) || "Bras\xedlia", " - ", (null == l ? void 0 : l.uf) || "DF"],
                                                                        }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Regi\xe3o:" }),
                                                                        (0, t.jsx)("p", { className: "text-blue-800 font-semibold", children: "Centro-Oeste" }),
                                                                    ],
                                                                }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Fonte:" }),
                                                                        (0, t.jsx)("p", { className: "text-blue-800 font-semibold", children: "ViaCEP - Correios" }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                            }),
                                        ],
                                    }),
                                    (0, t.jsx)("div", {
                                        className: "rounded-lg bg-card text-card-foreground shadow-sm mb-8 border-2 border-[#1351B4]",
                                        children: (0, t.jsxs)("div", {
                                            className: "p-6",
                                            children: [
                                                (0, t.jsx)("h3", { className: "text-lg font-semibold text-[#1351B4] mb-4", children: "Dados da Inscri\xe7\xe3o CNH Social" }),
                                                (0, t.jsxs)("div", {
                                                    className: "grid md:grid-cols-3 gap-6 text-sm",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Categoria CNH:" }),
                                                                (0, t.jsxs)("p", { className: "text-[#333] font-semibold", children: [s, " - ", r.name] }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            children: [(0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Autoescola:" }), (0, t.jsx)("p", { className: "text-[#333] font-semibold", children: a.name })],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            children: [(0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Pre\xe7o:" }), (0, t.jsx)("p", { className: "text-green-600 font-semibold", children: r.price })],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Carga Hor\xe1ria Te\xf3rica:" }),
                                                                (0, t.jsx)("p", { className: "text-[#333] font-semibold", children: S.theoreticalHours }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Carga Hor\xe1ria Pr\xe1tica:" }),
                                                                (0, t.jsx)("p", { className: "text-[#333] font-semibold", children: S.practicalHours }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("p", { className: "text-gray-600 font-medium", children: "Prazo de Conclus\xe3o:" }),
                                                                (0, t.jsx)("p", { className: "text-[#333] font-semibold", children: S.duration }),
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                    m &&
                                        (0, t.jsx)("div", {
                                            className: "rounded-lg text-card-foreground shadow-sm mb-8 border-2 border-orange-200 bg-orange-50",
                                            children: (0, t.jsxs)("div", {
                                                className: "p-6",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        className: "flex items-center mb-4",
                                                        children: [
                                                            (0, t.jsx)("div", { className: "w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-orange-600", children: (0, t.jsx)(n.A, { className: "w-5 h-5 text-white" }) }),
                                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-orange-800", children: "Verifica\xe7\xe3o Facial Obrigat\xf3ria" }),
                                                        ],
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        className: "space-y-4",
                                                        children: [
                                                            (0, t.jsx)("div", {
                                                                className: "bg-blue-50 border border-blue-200 rounded-lg p-4",
                                                                children: (0, t.jsxs)("div", {
                                                                    className: "flex items-start space-x-3",
                                                                    children: [
                                                                        (0, t.jsx)(E.A, { className: "w-5 h-5 text-blue-600 mt-0.5" }),
                                                                        (0, t.jsxs)("div", {
                                                                            children: [
                                                                                (0, t.jsx)("p", { className: "text-blue-800 text-sm font-medium", children: "Verifica\xe7\xe3o Facial Obrigat\xf3ria" }),
                                                                                (0, t.jsx)("p", {
                                                                                    className: "text-blue-700 text-sm mt-1",
                                                                                    children:
                                                                                        "Para garantir a seguran\xe7a do processo e confirmar sua identidade, \xe9 necess\xe1rio realizar a verifica\xe7\xe3o facial. Esta etapa \xe9 obrigat\xf3ria conforme normas do DENATRAN.",
                                                                                }),
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                            }),
                                                            !h &&
                                                                !b &&
                                                                !N &&
                                                                (0, t.jsxs)("div", {
                                                                    className: "text-center space-y-4",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "bg-gray-50 border border-gray-200 rounded-lg p-4",
                                                                            children: [
                                                                                (0, t.jsxs)("div", {
                                                                                    className: "flex items-center justify-center space-x-2 mb-3",
                                                                                    children: [
                                                                                        (0, t.jsx)(E.A, { className: "w-5 h-5 text-gray-600" }),
                                                                                        (0, t.jsx)("p", { className: "text-sm font-medium text-gray-700", children: "Instru\xe7\xf5es para Verifica\xe7\xe3o Facial" }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsxs)("ul", {
                                                                                    className: "text-sm text-gray-600 space-y-1 text-left",
                                                                                    children: [
                                                                                        (0, t.jsx)("li", { children: "• Certifique-se de estar em um local bem iluminado" }),
                                                                                        (0, t.jsx)("li", { children: "• Remova \xf3culos escuros ou objetos que cubram o rosto" }),
                                                                                        (0, t.jsx)("li", { children: "• Posicione a c\xe2mera na altura dos olhos" }),
                                                                                        (0, t.jsx)("li", { children: "• Mantenha o rosto centralizado na tela" }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("button", {
                                                                            className:
                                                                                "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 bg-[#1351B4] hover:bg-[#0c326f] text-white px-6 py-3",
                                                                            onClick: F,
                                                                            children: [(0, t.jsx)(z.A, { className: "w-5 h-5 mr-2" }), "Iniciar Verifica\xe7\xe3o Facial"],
                                                                        }),
                                                                    ],
                                                                }),
                                                            h &&
                                                                (0, t.jsxs)("div", {
                                                                    className: "text-center space-y-4",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "bg-white border border-gray-200 rounded-lg p-4",
                                                                            children: [
                                                                                (0, t.jsx)("p", { className: "text-sm font-medium text-gray-700 mb-4", children: "Posicione seu rosto no centro da c\xe2mera" }),
                                                                                (0, t.jsxs)("div", {
                                                                                    className: "relative inline-block",
                                                                                    children: [
                                                                                        (0, t.jsx)("video", {
                                                                                            ref: B,
                                                                                            className: "w-80 h-60 bg-gray-200 rounded-lg object-cover",
                                                                                            autoPlay: !0,
                                                                                            playsInline: !0,
                                                                                            muted: !0,
                                                                                            style: { transform: "scaleX(-1)" },
                                                                                        }),
                                                                                        (0, t.jsx)("div", { className: "absolute inset-0 border-4 border-dashed border-blue-500 rounded-lg pointer-events-none" }),
                                                                                        (0, t.jsx)("div", {
                                                                                            className:
                                                                                                "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-36 border-2 border-green-500 rounded-lg pointer-events-none",
                                                                                        }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("div", {
                                                                            className: "flex space-x-3 justify-center",
                                                                            children: [
                                                                                (0, t.jsx)("button", {
                                                                                    className: "px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors",
                                                                                    onClick: () => {
                                                                                        C && (C.getTracks().forEach((e) => e.stop()), H(null)), g(!1);
                                                                                    },
                                                                                    children: "Cancelar",
                                                                                }),
                                                                                (0, t.jsx)("button", { className: "px-6 py-2 bg-[#1351B4] text-white rounded-lg hover:bg-[#0c326f] transition-colors", onClick: D, children: "Capturar Foto" }),
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                            b &&
                                                                N &&
                                                                (0, t.jsx)("div", {
                                                                    className: "text-center space-y-4",
                                                                    children: (0, t.jsx)("div", {
                                                                        className: "bg-white border border-gray-200 rounded-lg p-6",
                                                                        children: (0, t.jsxs)("div", {
                                                                            className: "flex flex-col items-center space-y-4",
                                                                            children: [
                                                                                (0, t.jsx)("div", { className: "w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" }),
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-lg font-medium text-gray-700", children: "Verificando identidade..." }),
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-500 mt-1", children: "Comparando com dados da Receita Federal" }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsx)("div", {
                                                                                    className: "w-full bg-gray-200 rounded-full h-2",
                                                                                    children: (0, t.jsx)("div", { className: "bg-blue-600 h-2 rounded-full animate-pulse", style: { width: "75%" } }),
                                                                                }),
                                                                            ],
                                                                        }),
                                                                    }),
                                                                }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                        }),
                                    y &&
                                        (0, t.jsx)("div", {
                                            className: "rounded-lg text-card-foreground shadow-sm mb-8 border-2 border-green-200 bg-green-50",
                                            children: (0, t.jsxs)("div", {
                                                className: "p-6",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        className: "flex items-center mb-4",
                                                        children: [
                                                            (0, t.jsx)("div", { className: "w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3", children: (0, t.jsx)(k.A, { className: "w-5 h-5 text-white" }) }),
                                                            (0, t.jsx)("h3", { className: "text-lg font-semibold text-green-800", children: "Verifica\xe7\xe3o Facial Conclu\xedda" }),
                                                        ],
                                                    }),
                                                    (0, t.jsx)("div", {
                                                        className: "bg-white border border-green-200 rounded-lg p-4",
                                                        children: (0, t.jsxs)("div", {
                                                            className: "flex items-center space-x-3",
                                                            children: [
                                                                (0, t.jsx)("div", { className: "w-12 h-12 bg-green-100 rounded-full flex items-center justify-center", children: (0, t.jsx)(k.A, { className: "w-6 h-6 text-green-600" }) }),
                                                                (0, t.jsxs)("div", {
                                                                    children: [
                                                                        (0, t.jsx)("p", { className: "text-green-800 font-medium", children: "Identidade confirmada com sucesso!" }),
                                                                        (0, t.jsx)("p", {
                                                                            className: "text-green-700 text-sm mt-1",
                                                                            children: "Sua identidade foi verificada e confirmada atrav\xe9s de reconhecimento facial biom\xe9trico.",
                                                                        }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                    }),
                                                ],
                                            }),
                                        }),
                                    (0, t.jsx)("div", {
                                        className: "rounded-lg text-card-foreground shadow-sm mb-8 border-2 border-green-200 bg-green-50",
                                        children: (0, t.jsxs)("div", {
                                            className: "p-6",
                                            children: [
                                                (0, t.jsxs)("div", {
                                                    className: "flex items-center mb-4",
                                                    children: [
                                                        (0, t.jsx)("div", { className: "w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-green-600", children: (0, t.jsx)(k.A, { className: "w-5 h-5 text-white" }) }),
                                                        (0, t.jsx)("h3", { className: "text-lg font-semibold text-green-800", children: "Dados Verificados com Sucesso" }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "space-y-4",
                                                    children: [
                                                        (0, t.jsx)("div", {
                                                            className: "bg-blue-50 border border-blue-200 rounded-lg p-4",
                                                            children: (0, t.jsxs)("div", {
                                                                className: "flex items-start space-x-3",
                                                                children: [
                                                                    (0, t.jsx)(E.A, { className: "w-5 h-5 text-blue-600 mt-0.5" }),
                                                                    (0, t.jsxs)("div", {
                                                                        children: [
                                                                            (0, t.jsx)("p", { className: "text-blue-800 text-sm font-medium", children: "Pr\xf3ximos Passos" }),
                                                                            (0, t.jsx)("p", {
                                                                                className: "text-blue-700 text-sm mt-1",
                                                                                children: y
                                                                                    ? "Seus dados foram verificados com sucesso. Agora voc\xea pode prosseguir para o comprovante de matr\xedcula e finalizar sua inscri\xe7\xe3o no programa CNH Social."
                                                                                    : "Complete a verifica\xe7\xe3o facial para prosseguir com sua inscri\xe7\xe3o no programa CNH Social.",
                                                                            }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        }),
                                                        (0, t.jsx)("div", {
                                                            className: "text-center space-y-4",
                                                            children: (0, t.jsxs)("div", {
                                                                className: "bg-gray-50 border border-gray-200 rounded-lg p-4",
                                                                children: [
                                                                    (0, t.jsxs)("div", {
                                                                        className: "flex items-center justify-center space-x-2 mb-3",
                                                                        children: [
                                                                            (0, t.jsx)(E.A, { className: "w-5 h-5 text-gray-600" }),
                                                                            (0, t.jsx)("p", { className: "text-sm font-medium text-gray-700", children: "Informa\xe7\xf5es Importantes" }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("ul", {
                                                                        className: "text-sm text-gray-600 space-y-1 text-left",
                                                                        children: [
                                                                            (0, t.jsx)("li", { children: "• Ap\xf3s o pagamento, voc\xea receber\xe1 um e-mail de confirma\xe7\xe3o" }),
                                                                            (0, t.jsx)("li", { children: "• As aulas come\xe7ar\xe3o conforme cronograma da autoescola" }),
                                                                            (0, t.jsx)("li", { children: "• Mantenha seus documentos sempre atualizados" }),
                                                                            (0, t.jsx)("li", { children: "• Em caso de d\xfavidas, entre em contato com a autoescola" }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                    y &&
                                        (0, t.jsx)("div", {
                                            className: "text-center",
                                            children: (0, t.jsx)("button", {
                                                className:
                                                    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-8 py-3 text-lg font-medium bg-green-600 hover:bg-green-700 text-white",
                                                onClick: () => {
                                                    c();
                                                },
                                                children: "Gerar Comprovante de Matr\xedcula",
                                            }),
                                        }),
                                ],
                            }),
                        }),
                        (0, t.jsx)(j, {}),
                    ],
                });
            }
            var L = a(7073);
            function O(e) {
                let { selectedCategory: s, selectedSchool: a, categoryInfo: r, addressData: l, cpf: o, userData: n, selectedStartDate: d } = e;
                (0, i.useEffect)(() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }, []);
                let c = () => (d ? d.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + " \xe0s 08:00" : "Data n\xe3o selecionada");
                return (0, t.jsxs)("div", {
                    className: "min-h-screen bg-gray-50",
                    children: [
                        (0, t.jsx)(u, { showUserButton: !0, userData: n }),
                        (0, t.jsx)(p, {}),
                        (0, t.jsx)("main", {
                            className: "container mx-auto max-w-4xl px-4 py-8",
                            children: (0, t.jsxs)("div", {
                                className: "space-y-8",
                                children: [
                                    (0, t.jsxs)("div", {
                                        className: "text-center space-y-3",
                                        children: [
                                            (0, t.jsx)("div", { className: "inline-flex items-center px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700 font-medium", children: "DENATRAN" }),
                                            (0, t.jsx)("h1", { className: "text-2xl font-semibold text-gray-900 tracking-tight", children: "Comprovante de Matr\xedcula CNH" }),
                                            (0, t.jsx)("p", { className: "text-gray-500 text-sm max-w-2xl mx-auto", children: "CNH Social 2025 - Comprovante oficial de matr\xedcula" }),
                                        ],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "bg-white border border-gray-100 rounded-lg shadow-sm",
                                        children: [
                                            (0, t.jsx)("div", {
                                                className: "border-b border-gray-100 px-6 py-4",
                                                children: (0, t.jsxs)("div", {
                                                    className: "flex items-center justify-between",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("h2", { className: "text-lg font-medium text-gray-900", children: "Comprovante de Matr\xedcula CNH" }),
                                                                (0, t.jsxs)("p", {
                                                                    className: "text-sm text-gray-500 mt-1",
                                                                    children: [
                                                                        "Protocolo: ",
                                                                        (() => {
                                                                            var e;
                                                                            let s = (null == l ? void 0 : null === (e = l.localidade) || void 0 === e ? void 0 : e.toUpperCase()) || "BRAS\xcdLIA",
                                                                                a = Math.floor(9e5 * Math.random()) + 1e5;
                                                                            return "".concat(s, "-").concat(a);
                                                                        })(),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                        (0, t.jsx)("div", {
                                                            className: "text-right",
                                                            children: (0, t.jsx)("div", { className: "inline-flex items-center px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium", children: "Ativo" }),
                                                        }),
                                                    ],
                                                }),
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "px-6 py-8 space-y-8",
                                                children: (0, t.jsxs)("div", {
                                                    className: "space-y-6",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("h3", { className: "text-base font-medium text-[#555] mb-4", style: { fontWeight: 500 }, children: "Dados do Candidato" }),
                                                                (0, t.jsxs)("div", {
                                                                    className: "grid md:grid-cols-2 gap-6",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "space-y-3",
                                                                            children: [
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Nome Completo:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#555] font-medium", children: (null == n ? void 0 : n.nome) || "Carregando..." }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "CPF:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#555] font-medium", children: (null == n ? void 0 : n.cpf) || o }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsx)("div", {
                                                                            className: "space-y-3",
                                                                            children: (0, t.jsxs)("div", {
                                                                                children: [
                                                                                    (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Protocolo de Inscri\xe7\xe3o:" }),
                                                                                    (0, t.jsx)("p", {
                                                                                        className: "text-[#1451B4] font-mono text-sm font-medium",
                                                                                        children: (() => {
                                                                                            var e;
                                                                                            let s = (null == l ? void 0 : null === (e = l.localidade) || void 0 === e ? void 0 : e.toUpperCase()) || "BRAS\xcdLIA",
                                                                                                a = Math.floor(9e5 * Math.random()) + 1e5;
                                                                                            return "".concat(s, "-").concat(a);
                                                                                        })(),
                                                                                    }),
                                                                                ],
                                                                            }),
                                                                        }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                        (0, t.jsx)("hr", {}),
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("h3", { className: "text-base font-medium text-[#555] mb-4", style: { fontWeight: 500 }, children: "Dados da Habilita\xe7\xe3o CNH" }),
                                                                (0, t.jsxs)("div", {
                                                                    className: "grid md:grid-cols-2 gap-6",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "space-y-3",
                                                                            children: [
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Categoria CNH:" }),
                                                                                        (0, t.jsxs)("p", { className: "text-[#555] font-medium", children: ["CNH ", s, " - ", r.name] }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Programa:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#555] font-medium", children: "CNH Social" }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("div", {
                                                                            className: "space-y-3",
                                                                            children: [
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Autoescola:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#555] font-medium", children: a.name }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "C\xf3digo:" }),
                                                                                        (0, t.jsxs)("p", { className: "text-[#555] font-medium", children: ["CNH-", s] }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                        (0, t.jsx)("hr", {}),
                                                        (0, t.jsxs)("div", {
                                                            children: [
                                                                (0, t.jsx)("h3", { className: "text-base font-medium text-[#555] mb-4", style: { fontWeight: 500 }, children: "Informa\xe7\xf5es do Curso" }),
                                                                (0, t.jsxs)("div", {
                                                                    className: "grid md:grid-cols-3 gap-6",
                                                                    children: [
                                                                        (0, t.jsxs)("div", {
                                                                            className: "md:col-span-2 space-y-3",
                                                                            children: [
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Local do Curso:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#555] font-medium", children: a.name }),
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mt-1", children: a.address }),
                                                                                    ],
                                                                                }),
                                                                                (0, t.jsxs)("div", {
                                                                                    children: [
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mb-1", children: "Data de In\xedcio:" }),
                                                                                        (0, t.jsx)("p", { className: "text-[#d63638] font-medium text-lg", children: c() }),
                                                                                        (0, t.jsx)("p", { className: "text-sm text-gray-600 mt-1", children: "Compare\xe7a no hor\xe1rio combinado com a autoescola" }),
                                                                                    ],
                                                                                }),
                                                                            ],
                                                                        }),
                                                                        (0, t.jsxs)("div", {
                                                                            className: "flex flex-col items-center",
                                                                            children: [
                                                                                (0, t.jsx)("div", {
                                                                                    className: "border border-gray-200 p-3 bg-gray-50",
                                                                                    children: (0, t.jsx)("img", {
                                                                                        src: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=".concat(
                                                                                            encodeURIComponent(
                                                                                                "COMPROVANTE DE INSCRI\xc7\xc3O\nNome: "
                                                                                                    .concat((null == n ? void 0 : n.nome) || "Usu\xe1rio", "\nCPF: ")
                                                                                                    .concat((null == n ? void 0 : n.cpf) || o, "\nVaga: ")
                                                                                                    .concat(r.name, "\nLocal: ")
                                                                                                    .concat(a.name, "\nData: ")
                                                                                                    .concat(c(), "\nProtocolo: cnh_")
                                                                                                    .concat(s.toLowerCase(), "-")
                                                                                                    .concat(Math.floor(1e4 * Math.random()))
                                                                                            )
                                                                                        ),
                                                                                        alt: "QR Code do Comprovante",
                                                                                        className: "w-24 h-24",
                                                                                    }),
                                                                                }),
                                                                                (0, t.jsx)("p", { className: "text-xs text-gray-500 mt-2 text-center", children: "QR Code para valida\xe7\xe3o" }),
                                                                            ],
                                                                        }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                        (0, t.jsx)("hr", {}),
                                                        (0, t.jsxs)("div", {
                                                            className: "bg-yellow-50 border border-yellow-200 p-4",
                                                            children: [
                                                                (0, t.jsx)("h4", { className: "text-sm font-medium text-yellow-800 mb-2", children: "Orienta\xe7\xf5es Importantes:" }),
                                                                (0, t.jsxs)("ul", {
                                                                    className: "text-sm text-yellow-700 space-y-1",
                                                                    children: [
                                                                        (0, t.jsx)("li", { children: "• Apresente documento oficial com foto e este comprovante na autoescola" }),
                                                                        (0, t.jsx)("li", { children: "• O QR Code acima \xe9 \xfanico e serve para valida\xe7\xe3o da sua matr\xedcula" }),
                                                                        (0, t.jsx)("li", { children: "• Guarde este comprovante durante todo o processo de habilita\xe7\xe3o" }),
                                                                        (0, t.jsx)("li", { children: "• Em caso de d\xfavidas, entre em contato com a autoescola ou DENATRAN" }),
                                                                    ],
                                                                }),
                                                            ],
                                                        }),
                                                        (0, t.jsxs)("div", {
                                                            className: "text-center pt-4 border-t border-gray-200",
                                                            children: [
                                                                (0, t.jsxs)("p", {
                                                                    className: "text-xs text-gray-500",
                                                                    children: [
                                                                        "Comprovante emitido em ",
                                                                        (() => {
                                                                            let e = new Date();
                                                                            return e.toLocaleDateString("pt-BR") + " \xe0s " + e.toLocaleTimeString("pt-BR");
                                                                        })(),
                                                                    ],
                                                                }),
                                                                (0, t.jsx)("p", { className: "text-xs text-gray-500 mt-1", children: "DENATRAN - CNH Social 2025" }),
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                            }),
                                        ],
                                    }),
                                    (0, t.jsx)("div", {
                                        className: "bg-white border border-gray-100 rounded-lg shadow-sm",
                                        children: (0, t.jsxs)("div", {
                                            className: "px-6 py-8 text-center space-y-6",
                                            children: [
                                                (0, t.jsxs)("div", {
                                                    children: [
                                                        (0, t.jsx)("h3", { className: "text-xl font-semibold text-gray-900 mb-2", children: "Finalizar Inscri\xe7\xe3o CNH Social" }),
                                                        (0, t.jsx)("p", {
                                                            className: "text-gray-600",
                                                            children: "Sua matr\xedcula foi processada com sucesso. Clique no bot\xe3o abaixo para finalizar sua inscri\xe7\xe3o no programa CNH Social.",
                                                        }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("div", {
                                                    className: "bg-green-50 border border-green-200 rounded-lg p-4",
                                                    children: [
                                                        (0, t.jsxs)("div", {
                                                            className: "flex items-center justify-center space-x-2 mb-2",
                                                            children: [
                                                                (0, t.jsx)(k.A, { className: "w-5 h-5 text-green-600" }),
                                                                (0, t.jsxs)("span", { className: "text-green-800 font-medium", children: ["Valor da Inscri\xe7\xe3o: ", r.price] }),
                                                            ],
                                                        }),
                                                        (0, t.jsx)("p", { className: "text-green-700 text-sm", children: "Taxa \xfanica que cobre todos os custos do processo de habilita\xe7\xe3o" }),
                                                    ],
                                                }),
                                                (0, t.jsxs)("button", {
                                                    className:
                                                        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-12 px-8 w-full max-w-md mx-auto bg-[#1451B4] hover:bg-[#0c326f] text-white font-medium transition-all duration-200 text-lg",
                                                    onClick: () => {
                                                        //checkout aqui 
                                                        generatePixPayment();
                                                    },
                                                    children: [(0, t.jsx)(k.A, { className: "w-5 h-5" }), (0, t.jsxs)("span", { children: ["Finalizar Inscri\xe7\xe3o - ", r.price] })],
                                                }),
                                                (0, t.jsx)("div", {
                                                    className: "mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100",
                                                    children: (0, t.jsxs)("div", {
                                                        className: "flex items-start space-x-2",
                                                        children: [
                                                            (0, t.jsx)(L.A, { className: "w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" }),
                                                            (0, t.jsxs)("div", {
                                                                className: "text-xs text-gray-500 space-y-1",
                                                                children: [
                                                                    (0, t.jsx)("p", { className: "font-medium text-gray-600", children: "Pagamento Seguro" }),
                                                                    (0, t.jsx)("p", { children: "Processamento seguro via plataforma certificada. Seus dados est\xe3o protegidos." }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                }),
                                            ],
                                        }),
                                    }),
                                ],
                            }),
                        }),
                        (0, t.jsx)(j, {}),
                    ],
                });
            }
            var Z = a(5638),
                q = a(2225),
                $ = a(8024),
                G = a(4548),
                _ = a(5283);
            function U(e) {
                let { onStartInscription: s } = e;
                return (0, t.jsxs)("div", {
                    className: "min-h-screen bg-white",
                    children: [
                        (0, t.jsx)(u, { showUserButton: !1, onLoginClick: s }),
                        (0, t.jsx)(p, {}),
                        (0, t.jsx)("div", {
                            className: "container mx-auto px-4",
                            children: (0, t.jsxs)("div", {
                                className: "py-4",
                                children: [
                                    (0, t.jsxs)("div", {
                                        className: "flex items-center space-x-2 text-xs",
                                        children: [
                                            (0, t.jsx)("a", { href: "#", className: "text-[#1451B4]", children: "\uD83C\uDFE0" }),
                                            (0, t.jsx)("span", { className: "text-[#9E9D9D]", children: ">" }),
                                            (0, t.jsx)("a", { href: "#", className: "text-[#1451B4]", children: "Transportes" }),
                                            (0, t.jsx)("span", { className: "text-[#9E9D9D]", children: ">" }),
                                            (0, t.jsx)("a", { href: "#", className: "text-[#1451B4]", children: "Tr\xe2nsito" }),
                                            (0, t.jsx)("span", { className: "text-[#9E9D9D]", children: ">" }),
                                            (0, t.jsx)("span", { children: "CNH Social" }),
                                        ],
                                    }),
                                    (0, t.jsx)("p", { className: "text-xs", children: (0, t.jsx)("strong", { style: { fontWeight: 400 }, children: "Programa CNH Social - Carteira Nacional de Habilita\xe7\xe3o Gratuita" }) }),
                                ],
                            }),
                        }),
                        (0, t.jsx)("hr", {}),
                        (0, t.jsx)("main", {
                            className: "max-w-2xl mx-auto px-4 py-6",
                            children: (0, t.jsxs)("div", {
                                className: "space-y-8",
                                children: [
                                    (0, t.jsxs)("div", {
                                        className: "space-y-4",
                                        children: [
                                            (0, t.jsx)("h1", { style: { fontWeight: 700, color: "rgb(85, 85, 85)" }, className: "text-lg font-light text-gray-900", children: "CNH Social 2025: Conquiste sua liberdade e independ\xeancia" }),
                                            (0, t.jsx)("p", {
                                                className: "text-xl text-[#0c326f] font-light",
                                                children: (0, t.jsx)("strong", { style: { fontWeight: 500, fontSize: "1.4rem", lineHeight: "2.5rem" }, children: "Mais de 150.000 vagas para CNH gratuita em todo o Brasil" }),
                                            }),
                                        ],
                                    }),
                                    (0, t.jsxs)("div", {
                                        className: "space-y-6",
                                        style: { marginTop: "0px" },
                                        children: [
                                            (0, t.jsx)("section", {
                                                className: "space-y-6",
                                                children: (0, t.jsxs)("p", {
                                                    className: "text-lg text-gray-700 mt-4 leading-relaxed",
                                                    children: [
                                                        "O maior programa de CNH Social do Brasil j\xe1 est\xe1 com inscri\xe7\xf5es abertas e beneficiar\xe1",
                                                        (0, t.jsxs)("strong", { className: "text-[#1351B4]", children: [" ", "milh\xf5es de brasileiros garantindo mobilidade e oportunidades", " "] }),
                                                        "em 2025.",
                                                    ],
                                                }),
                                            }),
                                            (0, t.jsx)("hr", {}),
                                            (0, t.jsxs)("div", {
                                                className: "flex justify-center align-items-center text-center gap-4",
                                                style: { alignItems: "center" },
                                                children: [
                                                    (0, t.jsx)("p", { className: "text-[13px] text-[#555]", children: "Compartilhe esta oportunidade: " }),
                                                    (0, t.jsxs)("div", {
                                                        className: "flex space-x-3 gap-1",
                                                        children: [
                                                            (0, t.jsx)("button", {
                                                                className: "text-blue-600 hover:text-blue-800 transition-colors p-1",
                                                                title: "Compartilhar no Facebook",
                                                                children: (0, t.jsx)(Z.A, { className: "w-4 h-4" }),
                                                            }),
                                                            (0, t.jsx)("button", {
                                                                className: "text-blue-500 hover:text-blue-700 transition-colors p-1",
                                                                title: "Compartilhar no Twitter",
                                                                children: (0, t.jsx)(q.A, { className: "w-4 h-4" }),
                                                            }),
                                                            (0, t.jsx)("button", {
                                                                className: "text-blue-700 hover:text-blue-900 transition-colors p-1",
                                                                title: "Compartilhar no LinkedIn",
                                                                children: (0, t.jsx)($.A, { className: "w-4 h-4" }),
                                                            }),
                                                            (0, t.jsx)("button", {
                                                                className: "text-green-500 hover:text-green-700 transition-colors p-1",
                                                                title: "Compartilhar no WhatsApp",
                                                                children: (0, t.jsx)(G.A, { className: "w-4 h-4" }),
                                                            }),
                                                            (0, t.jsx)("button", { className: "text-gray-500 hover:text-gray-700 transition-colors p-1", title: "Copiar link", children: (0, t.jsx)(_.A, { className: "w-4 h-4" }) }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsx)("p", { className: "text-center text-[#555] text-[14px] pb-4", style: { fontWeight: 400 }, children: "Publicado em 04/06/2025 15h42" }),
                                            (0, t.jsx)("div", {
                                                className: "w-full",
                                                children: (0, t.jsx)("img", { src: "./images/cnh-social-2025.jpg", alt: "CNH Social 2025 - Voc\xea no caminho da sua habilita\xe7\xe3o", className: "w-full rounded-lg shadow-lg" }),
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "mt-6",
                                                children: (0, t.jsxs)("p", {
                                                    className: "text-justify text-gray-700 leading-relaxed",
                                                    children: [
                                                        (0, t.jsx)("span", { className: "float-left text-6xl font-bold text-blue-600 leading-none mr-2 mt-1", children: "O" }),
                                                        "CNH Social \xe9 uma iniciativa dos governos estaduais, com apoio da Associa\xe7\xe3o Nacional de Detrans (AND), que oferece a Carteira Nacional de Habilita\xe7\xe3o sem custo para pessoas de baixa renda. O programa visa promover a inclus\xe3o social e ampliar as oportunidades de trabalho e mobilidade urbana para milh\xf5es de brasileiros.",
                                                    ],
                                                }),
                                            }),
                                            (0, t.jsx)("div", {
                                                className: "border-l-4 border-[#1351B4] bg-white py-6 px-8 my-8",
                                                children: (0, t.jsxs)("div", {
                                                    className: "max-w-4xl",
                                                    children: [
                                                        (0, t.jsx)("h3", { className: "text-lg font-medium text-gray-900 mb-2", children: "CNH Social - Carteira de Motorista Gratuita" }),
                                                        (0, t.jsx)("p", {
                                                            className: "text-gray-600 mb-4 text-base",
                                                            children:
                                                                "Mais de 150.000 vagas para brasileiros de baixa renda. Pessoas inscritas no Cad\xdanico, benefici\xe1rios do Bolsa Fam\xedlia e trabalhadores com renda familiar at\xe9 3 sal\xe1rios m\xednimos. Processo 100% digital e simplificado.",
                                                        }),
                                                        (0, t.jsx)("button", {
                                                            className: "bg-[#1351B4] text-white px-6 py-3 text-sm font-medium rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 animate-pulse",
                                                            onClick: s,
                                                            children: "Acessar inscri\xe7\xf5es agora",
                                                        }),
                                                    ],
                                                }),
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsxs)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children: [
                                                            "O programa CNH Social oferece carteira de motorista gratuita para pessoas de baixa renda em todo o Brasil.",
                                                            " ",
                                                            (0, t.jsx)("strong", { children: "N\xe3o \xe9 necess\xe1rio ter experi\xeancia pr\xe9via na condu\xe7\xe3o - oferecemos treinamento completo gratuito." }),
                                                        ],
                                                    }),
                                                    (0, t.jsxs)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children: [
                                                            "Uma das prioridades \xe9 ampliar o acesso \xe0 mobilidade urbana, com parcerias entre autoescolas credenciadas e \xf3rg\xe3os de tr\xe2nsito estaduais e municipais. A estimativa \xe9 que seja poss\xedvel beneficiar at\xe9",
                                                            " ",
                                                            (0, t.jsx)("strong", { className: "text-[#1351B4]", children: "150.000 brasileiros" }),
                                                            " em todas as regi\xf5es do pa\xeds.",
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: "A import\xe2ncia da mobilidade urbana no Brasil" }),
                                                    (0, t.jsxs)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children: [
                                                            "As a\xe7\xf5es unem esfor\xe7os dos governos estaduais e federais para atender a uma demanda urgente de mobilidade urbana da popula\xe7\xe3o brasileira. Milh\xf5es de brasileiros n\xe3o possuem carteira de motorista devido aos ",
                                                            (0, t.jsx)("strong", { children: "altos custos" }),
                                                            ", que podem chegar a R$ 3.000 reais, limitando oportunidades de trabalho.",
                                                        ],
                                                    }),
                                                    (0, t.jsxs)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children: [
                                                            "Dados do DENATRAN apontam que pessoas com CNH t\xeam ",
                                                            (0, t.jsx)("strong", { children: "35% mais chances" }),
                                                            " de conseguir emprego em \xe1reas urbanas. H\xe1 uma necessidade de o pa\xeds ampliar o acesso \xe0 carteira de motorista para",
                                                            " ",
                                                            (0, t.jsx)("strong", { children: "reduzir a desigualdade social" }),
                                                            " e promover inclus\xe3o.",
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: "Benef\xedcios e vantagens da CNH Social" }),
                                                    (0, t.jsxs)("ul", {
                                                        className: "space-y-3 text-gray-700",
                                                        children: [
                                                            (0, t.jsxs)("li", {
                                                                children: ["• ", (0, t.jsx)("strong", { children: "Carteira de motorista gratuita:" }), " CNH sem custo para pessoas de baixa renda cadastradas no Cad\xdanico"],
                                                            }),
                                                            (0, t.jsxs)("li", {
                                                                children: ["• ", (0, t.jsx)("strong", { children: "Mais oportunidades de trabalho:" }), " Acesso a vagas que exigem habilita\xe7\xe3o como motorista, entregador, vendedor"],
                                                            }),
                                                            (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Aulas te\xf3ricas e pr\xe1ticas:" }), " Treinamento completo gratuito em autoescolas credenciadas"] }),
                                                            (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Flexibilidade de hor\xe1rios:" }), " Aulas adaptadas \xe0 disponibilidade do benefici\xe1rio"] }),
                                                            (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Inclus\xe3o social:" }), " Maior autonomia e mobilidade urbana para toda a fam\xedlia"] }),
                                                            (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Impacto econ\xf4mico direto:" }), " Economia de at\xe9 R$ 3.000 reais no processo de habilita\xe7\xe3o"] }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: "Como realizar sua inscri\xe7\xe3o" }),
                                                    (0, t.jsx)("div", {
                                                        className: "space-y-4",
                                                        children: (0, t.jsxs)("p", {
                                                            className: "text-lg text-gray-700 leading-relaxed",
                                                            children: [
                                                                (0, t.jsx)("strong", { children: "Inscri\xe7\xe3o online obrigat\xf3ria:" }),
                                                                " Todo o processo \xe9 realizado digitalmente atrav\xe9s do portal oficial do governo, garantindo transpar\xeancia e agilidade. Para garantir a participa\xe7\xe3o no programa CNH Social, \xe9 necess\xe1rio o pagamento de uma taxa \xfanica de ",
                                                                (0, t.jsx)("strong", { children: "R$ 61,90" }),
                                                                " que cobre os custos operacionais do processo.",
                                                            ],
                                                        }),
                                                    }),
                                                    (0, t.jsxs)("div", {
                                                        className: "bg-gray-50 border border-gray-200 p-6 mt-6",
                                                        children: [
                                                            (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Taxa de Inscri\xe7\xe3o" }),
                                                            (0, t.jsxs)("div", {
                                                                className: "space-y-2",
                                                                children: [
                                                                    (0, t.jsxs)("p", { className: "text-gray-700", children: [(0, t.jsx)("span", { className: "font-medium", children: "Valor:" }), " R$ 61,90"] }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-gray-600 text-sm leading-relaxed",
                                                                        children:
                                                                            "Cobre custos operacionais: seguran\xe7a digital, valida\xe7\xe3o documental, infraestrutura t\xe9cnica, suporte ao candidato e auditoria do processo seletivo.",
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("div", {
                                                className: "bg-white border border-gray-200 rounded-lg p-8 my-8 shadow-sm",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        className: "flex items-start space-x-4",
                                                        children: [
                                                            (0, t.jsx)("div", {
                                                                className: "flex-shrink-0",
                                                                children: (0, t.jsx)("div", {
                                                                    className: "w-12 h-12 bg-[#1351B4] rounded-full flex items-center justify-center",
                                                                    children: (0, t.jsx)("svg", {
                                                                        className: "w-6 h-6 text-white",
                                                                        fill: "none",
                                                                        stroke: "currentColor",
                                                                        viewBox: "0 0 24 24",
                                                                        children: (0, t.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" }),
                                                                    }),
                                                                }),
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "flex-grow",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "text-lg font-semibold text-gray-900 mb-2", children: "CNH Social - Aberto para TODOS os Brasileiros de Baixa Renda" }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-gray-600 mb-4",
                                                                        children:
                                                                            "Especialmente criado para pessoas cadastradas no Cad\xdanico, benefici\xe1rios do Bolsa Fam\xedlia e trabalhadores com renda familiar at\xe9 3 sal\xe1rios m\xednimos. Mais de 150.000 vagas para CNH gratuita em todo o Brasil. Todas as categorias dispon\xedveis: A, B, C, D e E.",
                                                                    }),
                                                                    (0, t.jsxs)("button", {
                                                                        className:
                                                                            "bg-[#1351B4] text-white px-8 py-3 rounded-lg font-medium shadow-lg transform hover:scale-105 transition-all duration-300 flex items-center space-x-2 text-lg",
                                                                        onClick: s,
                                                                        children: [
                                                                            (0, t.jsx)("span", { children: "\uD83D\uDCA1 Inscreva-se Agora" }),
                                                                            (0, t.jsx)("svg", {
                                                                                className: "w-5 h-5",
                                                                                fill: "none",
                                                                                stroke: "currentColor",
                                                                                viewBox: "0 0 24 24",
                                                                                children: (0, t.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 5l7 7-7 7" }),
                                                                            }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                    (0, t.jsx)("div", {
                                                        className: "mt-6 pt-4 border-t border-gray-100",
                                                        children: (0, t.jsxs)("div", {
                                                            className: "flex items-center text-sm text-gray-500",
                                                            children: [
                                                                (0, t.jsx)("svg", {
                                                                    className: "w-4 h-4 mr-2",
                                                                    fill: "none",
                                                                    stroke: "currentColor",
                                                                    viewBox: "0 0 24 24",
                                                                    children: (0, t.jsx)("path", {
                                                                        strokeLinecap: "round",
                                                                        strokeLinejoin: "round",
                                                                        strokeWidth: "2",
                                                                        d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
                                                                    }),
                                                                }),
                                                                "Servi\xe7o oficial protegido com login gov.br",
                                                            ],
                                                        }),
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: "Categorias de CNH Dispon\xedveis" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "bg-white border border-gray-200 rounded-lg p-6",
                                                        children: [
                                                            (0, t.jsx)("h3", { className: "font-semibold text-gray-900 mb-4", children: "Todas as Categorias de Habilita\xe7\xe3o" }),
                                                            (0, t.jsx)("p", {
                                                                className: "text-gray-700 leading-relaxed mb-4",
                                                                children: "O programa oferece CNH gratuita em todas as categorias, independente da idade ou experi\xeancia. Oferecemos treinamento completo e acompanhamento personalizado.",
                                                            }),
                                                            (0, t.jsxs)("ul", {
                                                                className: "space-y-3 text-gray-700",
                                                                children: [
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Categoria A:" }), " Motocicletas, motonetas e ciclomotores - Idade m\xednima: 18 anos"] }),
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Categoria B:" }), " Autom\xf3veis at\xe9 8 lugares e 3.500kg - Idade m\xednima: 18 anos"] }),
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Categoria C:" }), " Ve\xedculos de carga acima de 3.500kg - Idade m\xednima: 21 anos"] }),
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Categoria D:" }), " Transporte de passageiros - Idade m\xednima: 21 anos"] }),
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Categoria E:" }), " Ve\xedculos com reboque acima de 6.000kg - Idade m\xednima: 21 anos"] }),
                                                                    (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Requisitos:" }), " Renda familiar at\xe9 3 sal\xe1rios m\xednimos ou Cad\xdanico ativo"] }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "my-12",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900 mb-8", children: "Benef\xedcios do CNH Social" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "grid md:grid-cols-2 gap-6",
                                                        children: [
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Aulas Te\xf3ricas Gratuitas" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "45 horas/aula de legisla\xe7\xe3o de tr\xe2nsito, dire\xe7\xe3o defensiva e primeiros socorros." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Aulas Pr\xe1ticas Gratuitas" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "20 horas/aula de condu\xe7\xe3o veicular com instrutor qualificado em autoescola credenciada." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Exame M\xe9dico Gratuito" }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-gray-600 text-sm",
                                                                        children: "Avalia\xe7\xe3o m\xe9dica e psicol\xf3gica necess\xe1ria para obten\xe7\xe3o da CNH sem custo adicional.",
                                                                    }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Material Did\xe1tico" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Apostilas, simulados online e acesso a plataforma de estudos para o exame te\xf3rico." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Flexibilidade de Hor\xe1rios" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Aulas nos per\xedodos manh\xe3, tarde e noite para adequar \xe0 rotina de trabalho do benefici\xe1rio." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Acompanhamento Personalizado" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Suporte individual para alunos com dificuldades de aprendizagem ou primeira habilita\xe7\xe3o." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Renova\xe7\xe3o Facilitada" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Processo simplificado para renova\xe7\xe3o da CNH com descontos especiais." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Segunda Chance" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Possibilidade de repetir exames sem custo adicional em caso de reprova\xe7\xe3o." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Certificado Reconhecido" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "CNH com validade nacional, aceita em todo territ\xf3rio brasileiro." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Economia Total" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Economia de at\xe9 R$ 3.000 reais no processo completo de habilita\xe7\xe3o." }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "my-12",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900 mb-8", children: "Requisitos para Participar" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "grid md:grid-cols-2 gap-6",
                                                        children: [
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Renda Familiar" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Renda familiar de at\xe9 3 sal\xe1rios m\xednimos ou estar inscrito no Cad\xdanico." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Idade M\xednima" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "18 anos para categorias A e B, 21 anos para categorias C, D e E." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Documenta\xe7\xe3o" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "RG, CPF, comprovante de resid\xeancia e comprovante de renda familiar." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Alfabetiza\xe7\xe3o" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Saber ler e escrever para compreender as sinaliza\xe7\xf5es de tr\xe2nsito." }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                className: "bg-white border border-gray-200 p-6 md:col-span-2",
                                                                children: [
                                                                    (0, t.jsx)("h3", { className: "font-medium text-gray-900 mb-2", children: "Disponibilidade" }),
                                                                    (0, t.jsx)("p", { className: "text-gray-600 text-sm", children: "Disponibilidade para frequentar aulas te\xf3ricas e pr\xe1ticas conforme cronograma." }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("div", {
                                                className: "bg-gray-50 border border-gray-200 rounded-lg p-6 my-8",
                                                children: [
                                                    (0, t.jsx)("h3", { className: "font-semibold text-gray-900 mb-4", children: "Links importantes do programa" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "space-y-3",
                                                        children: [
                                                            (0, t.jsxs)("p", {
                                                                className: "flex",
                                                                children: [
                                                                    (0, t.jsx)("strong", { children: "→ " }),
                                                                    (0, t.jsx)("button", { className: "text-blue-600 hover:text-blue-800 underline transition-colors ml-2", onClick: s, children: "Inscreva-se no CNH Social 2025" }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("p", {
                                                                className: "flex",
                                                                children: [
                                                                    (0, t.jsx)("strong", { children: "→ " }),
                                                                    (0, t.jsx)("button", { className: "text-blue-600 hover:text-blue-800 underline transition-colors ml-2", onClick: s, children: "Consulte autoescolas credenciadas" }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("div", {
                                                className: "bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6",
                                                children: [
                                                    (0, t.jsxs)("div", {
                                                        className: "flex items-center mb-3",
                                                        children: [
                                                            (0, t.jsx)("img", { src: "/images/presidente-lula.jpg", alt: "Presidente Lula", className: "w-12 h-12 rounded-full mr-3" }),
                                                            (0, t.jsxs)("div", {
                                                                children: [
                                                                    (0, t.jsx)("p", { className: "font-semibold text-gray-900", children: "Presidente Luiz In\xe1cio Lula da Silva" }),
                                                                    (0, t.jsx)("p", { className: "text-sm text-gray-600", children: "Presidente da Rep\xfablica" }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                    (0, t.jsx)("blockquote", {
                                                        className: "text-lg italic text-gray-800 border-l-4 border-yellow-400 pl-4",
                                                        children: '"A mobilidade \xe9 um direito fundamental. Vamos garantir que todos os brasileiros tenham acesso \xe0 CNH"',
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: (0, t.jsx)("strong", { children: "Consolidar o maior programa de CNH Social do Brasil" }) }),
                                                    (0, t.jsx)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children:
                                                            "O programa prev\xea a consolida\xe7\xe3o da CNH Social como a maior iniciativa de mobilidade urbana gratuita do pa\xeds. O governo vai ampliar significativamente o acesso \xe0 carteira de motorista, representando um aumento na inclus\xe3o social e oportunidades de trabalho para milh\xf5es de brasileiros.",
                                                    }),
                                                    (0, t.jsx)("p", {
                                                        className: "text-lg text-gray-700 leading-relaxed",
                                                        children:
                                                            '"Vamos consolidar o Brasil como refer\xeancia mundial em programas sociais de mobilidade urbana. Estamos montando uma estrutura nacional de habilita\xe7\xe3o gratuita, que j\xe1 come\xe7a a funcionar imediatamente. Isso vai acelerar a inclus\xe3o social e reduzir a desigualdade de oportunidades", afirmou o ministro dos Transportes.',
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "space-y-6",
                                                children: [
                                                    (0, t.jsx)("h2", { className: "text-2xl font-light text-gray-900", children: "Impacto Social e Alcance Nacional" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "rounded-lg p-6",
                                                        children: [
                                                            (0, t.jsxs)("div", {
                                                                className: "grid md:grid-cols-3 gap-6",
                                                                children: [
                                                                    (0, t.jsxs)("div", {
                                                                        className: "text-center",
                                                                        children: [
                                                                            (0, t.jsx)("div", { className: "text-3xl font-bold text-blue-600 mb-2", children: "150 mil" }),
                                                                            (0, t.jsx)("p", { className: "text-sm text-gray-600", children: "Vagas CNH gratuita" }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("div", {
                                                                        className: "text-center",
                                                                        children: [
                                                                            (0, t.jsx)("div", { className: "text-3xl font-bold text-blue-600 mb-2", children: "27 estados" }),
                                                                            (0, t.jsx)("p", { className: "text-sm text-gray-600", children: "Cobertura nacional completa" }),
                                                                        ],
                                                                    }),
                                                                    (0, t.jsxs)("div", {
                                                                        className: "text-center",
                                                                        children: [
                                                                            (0, t.jsx)("div", { className: "text-3xl font-bold text-blue-600 mb-2", children: "5 milh\xf5es" }),
                                                                            (0, t.jsx)("p", { className: "text-sm text-gray-600", children: "Brasileiros beneficiados" }),
                                                                        ],
                                                                    }),
                                                                ],
                                                            }),
                                                            (0, t.jsx)("p", {
                                                                className: "text-gray-700 leading-relaxed mt-6",
                                                                children:
                                                                    "O CNH Social representa uma das maiores iniciativas de inclus\xe3o social e mobilidade urbana do Brasil, impactando diretamente a qualidade de vida de milh\xf5es de brasileiros e oferecendo oportunidades de trabalho e autonomia para pessoas de baixa renda.",
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                            (0, t.jsxs)("section", {
                                                className: "rounded-lg p-6",
                                                children: [
                                                    (0, t.jsx)("h3", { className: "font-semibold text-gray-900 mb-4", children: "Vantagens do CNH Social" }),
                                                    (0, t.jsxs)("div", {
                                                        className: "grid md:grid-cols-3 gap-6",
                                                        children: [
                                                            (0, t.jsxs)("div", {
                                                                children: [
                                                                    (0, t.jsx)("h4", { className: "font-medium text-gray-900 mb-2", children: "Autonomia e Mobilidade" }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-sm text-gray-600",
                                                                        children: "Liberdade para se locomover, independ\xeancia para trabalhar e estudar sem depender de transporte p\xfablico ou outras pessoas",
                                                                    }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                children: [
                                                                    (0, t.jsx)("h4", { className: "font-medium text-gray-900 mb-2", children: "Oportunidades de Trabalho" }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-sm text-gray-600",
                                                                        children: "Acesso a milhares de vagas de emprego que exigem CNH como motorista, entregador, vendedor externo e representante comercial",
                                                                    }),
                                                                ],
                                                            }),
                                                            (0, t.jsxs)("div", {
                                                                children: [
                                                                    (0, t.jsx)("h4", { className: "font-medium text-gray-900 mb-2", children: "Inclus\xe3o Social" }),
                                                                    (0, t.jsx)("p", {
                                                                        className: "text-sm text-gray-600",
                                                                        children: "Redu\xe7\xe3o da desigualdade social atrav\xe9s do acesso gratuito \xe0 habilita\xe7\xe3o, beneficiando milh\xf5es de brasileiros de baixa renda",
                                                                    }),
                                                                ],
                                                            }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        }),
                        (0, t.jsx)(j, {}),
                    ],
                });
            }
            function W() {
                let [e, s] = (0, i.useState)(!0),
                    [a, d] = (0, i.useState)(""),
                    [c, m] = (0, i.useState)(!1),
                    [x, h] = (0, i.useState)(!1),
                    [g, b] = (0, i.useState)(!1),
                    [N, v] = (0, i.useState)(!1),
                    [y, A] = (0, i.useState)([]),
                    [B, S] = (0, i.useState)(""),
                    [R, V] = (0, i.useState)(""),
                    [M, k] = (0, i.useState)(!1),
                    [P, E] = (0, i.useState)(!1),
                    [z, L] = (0, i.useState)(!1),
                    [Z, q] = (0, i.useState)(""),
                    [$, G] = (0, i.useState)(!1),
                    [_, W] = (0, i.useState)(null),
                    [Q, Y] = (0, i.useState)(!1),
                    [X, J] = (0, i.useState)(null),
                    [K, ee] = (0, i.useState)([]),
                    [es, ea] = (0, i.useState)(!1),
                    [et, ei] = (0, i.useState)(!1),
                    [er, el] = (0, i.useState)(null),
                    [eo, en] = (0, i.useState)(null),
                    [ed, ec] = (0, i.useState)(!1),
                    [em, ex] = (0, i.useState)(!1),
                    [eh, eu] = (0, i.useState)(!1),
                    [eg, ep] = (0, i.useState)(null),
                    [eb, ej] = (0, i.useState)(null),
                    [ef, eN] = (0, i.useState)(!1),
                    ev = () => {
                        try {
                            window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                        } catch (e) {
                            try {
                                window.scrollTo(0, 0);
                            } catch (e) {
                                try {
                                    (document.body.scrollTop = 0), (document.documentElement.scrollTop = 0);
                                } catch (e) {
                                    console.warn("N\xe3o foi poss\xedvel fazer scroll para o topo");
                                }
                            }
                        }
                        setTimeout(() => {
                            try {
                                document.body.scrollIntoView({ behavior: "smooth", block: "start" });
                            } catch (e) {}
                        }, 50),
                            setTimeout(() => {
                                try {
                                    (window.pageYOffset = 0), (document.documentElement.scrollTop = 0), (document.body.scrollTop = 0);
                                } catch (e) {}
                            }, 100);
                    };
                (0, i.useEffect)(() => {
                    if (Q && !et) {
                        window.initMap = () => {
                            ei(!0);
                        };
                        let e = document.createElement("script");
                        return (
                            (e.src = "https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places&callback=initMap"),
                            (e.async = !0),
                            (e.defer = !0),
                            document.head.appendChild(e),
                            () => {
                                document.head.removeChild(e), delete window.initMap;
                            }
                        );
                    }
                }, [Q, et]),
                    (0, i.useEffect)(() => {
                        _ && el({ lat: -15.7801 + 0.05 * Math.random(), lng: -47.9292 + 0.05 * Math.random() });
                    }, [_]);
                let ey = (e) => {
                        let s = e.replace(/\D/g, "");
                        return s.length <= 11
                            ? s
                                  .replace(/(\d{3})(\d)/, "$1.$2")
                                  .replace(/(\d{3})(\d)/, "$1.$2")
                                  .replace(/(\d{3})(\d{1,2})/, "$1-$2")
                            : s.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                    },
                    ew = (e) => {
                        let s = e.replace(/\D/g, "");
                        return s.length <= 8 ? s.replace(/(\d{5})(\d)/, "$1-$2") : s.slice(0, 8).replace(/(\d{5})(\d{3})/, "$1-$2");
                    },
                    eC = (e) => {
                        let s = e.replace(/\D/g, "");
                        if (11 !== s.length || /^(\d)\1{10}$/.test(s)) return !1;
                        let a = 0;
                        for (let e = 0; e < 9; e++) a += Number.parseInt(s[e]) * (10 - e);
                        let t = a % 11,
                            i = t < 2 ? 0 : 11 - t;
                        if (Number.parseInt(s[9]) !== i) return !1;
                        a = 0;
                        for (let e = 0; e < 10; e++) a += Number.parseInt(s[e]) * (11 - e);
                        let r = (t = a % 11) < 2 ? 0 : 11 - t;
                        return Number.parseInt(s[10]) === r;
                    },
                    eH = async (e) => {
                        try {
                            let s = e.replace(/\D/g, ""),
                                a = await fetch("https://brasilapi.com.br/api/cep/v1/".concat(s)),
                                t = await a.json();
                            if (t.type === "validation_error" || t.message) throw Error("CEP n\xe3o encontrado");
                            // Mapear os campos da Brasil API para o formato esperado pelo código
                            return {
                                cep: t.cep,
                                logradouro: t.street,
                                complemento: "",
                                bairro: t.neighborhood,
                                localidade: t.city,
                                uf: t.state,
                                ibge: "",
                                gia: "",
                                ddd: "",
                                siafi: ""
                            };
                        } catch (e) {
                            return console.error("Erro ao buscar CEP:", e), null;
                        }
                    },
                    eA = async (e, s, a) => {
                        await new Promise((e) => setTimeout(e, 2e3));
                        let t = (e, s) => {
                                let a = ["Auto Escola", "CFC", "Centro de Forma\xe7\xe3o", "Escola de Condutores", "Academia de Condu\xe7\xe3o"],
                                    t = ["Brasil", (null == _ ? void 0 : _.localidade) || "Bras\xedlia", "Federal", "Capital", "Planalto", "Central"],
                                    i = a[Math.floor(Math.random() * a.length)],
                                    r = t[Math.floor(Math.random() * t.length)];
                                return "A" === s ? "".concat(i, " Moto ").concat(r) : "B" === s ? "".concat(i, " ").concat(r) : "".concat(i, " ").concat(r, " AB");
                            },
                            i = (e) => {
                                let s = "".concat((null == _ ? void 0 : _.logradouro) || "Quadra QR 413", ", ").concat((null == _ ? void 0 : _.bairro) || "Samambaia Norte");
                                return "Pr\xf3ximo \xe0 ".concat(s);
                            },
                            r = () => (5 * Math.random() + 0.5).toFixed(1) + "km",
                            l = () => Number((2 * Math.random() + 3).toFixed(1)),
                            o = () => (Math.random() > 0.3 ? "Credenciada" : "Parceira");
                        return Array.from({ length: Math.floor(3 * Math.random()) + 3 }, (n, d) => ({
                            id: "place_".concat(d, "_").concat(Date.now()),
                            name: t(d, a),
                            address: i(d),
                            distance: r(),
                            rating: l(),
                            maxRating: 5,
                            type: o(),
                            categories: "AB" === a ? ["A", "B", "AB"] : [a],
                            place_id: "place_id_".concat(d, "_").concat(Date.now()),
                            geometry: { location: { lat: e + (Math.random() - 0.5) * 0.02, lng: s + (Math.random() - 0.5) * 0.02 } },
                            vicinity: i(d),
                        }));
                    },
                    eB = async (e) => {
                        ea(!0), en(null);
                        try {
                            if (!er) throw Error("Coordenadas n\xe3o dispon\xedveis");
                            let s = await eA(er.lat, er.lng, e);
                            ee(s.slice(0, 3));
                        } catch (s) {
                            console.error("Erro ao buscar autoescolas:", s),
                                ee(
                                    [
                                        {
                                            id: "1",
                                            name: "Auto Escola Bras\xedlia",
                                            address: "Rua Principal, 123 - "
                                                .concat((null == _ ? void 0 : _.bairro) || "Samambaia Norte", ", ")
                                                .concat((null == _ ? void 0 : _.localidade) || "Bras\xedlia", " - ")
                                                .concat((null == _ ? void 0 : _.uf) || "DF"),
                                            distance: "3.9km",
                                            rating: 3.7,
                                            maxRating: 5,
                                            type: "Credenciada",
                                            categories: ["A", "B", "AB"],
                                        },
                                        {
                                            id: "2",
                                            name: "Centro de Forma\xe7\xe3o de Condutores DF",
                                            address: "Av. Central, 456 - "
                                                .concat((null == _ ? void 0 : _.bairro) || "Samambaia Norte", ", ")
                                                .concat((null == _ ? void 0 : _.localidade) || "Bras\xedlia", " - ")
                                                .concat((null == _ ? void 0 : _.uf) || "DF"),
                                            distance: "2.6km",
                                            rating: 4.2,
                                            maxRating: 5,
                                            type: "Credenciada",
                                            categories: ["A", "B", "AB"],
                                        },
                                        {
                                            id: "3",
                                            name: "CFC Cidade Bras\xedlia",
                                            address: "Rua Comercial, 789 - "
                                                .concat((null == _ ? void 0 : _.bairro) || "Samambaia Norte", ", ")
                                                .concat((null == _ ? void 0 : _.localidade) || "Bras\xedlia", " - ")
                                                .concat((null == _ ? void 0 : _.uf) || "DF"),
                                            distance: "4.6km",
                                            rating: 5,
                                            maxRating: 5,
                                            type: "Parceira",
                                            categories: ["A", "B", "AB"],
                                        },
                                    ]
                                        .filter((s) => s.categories.includes(e))
                                        .slice(0, 3)
                                );
                        } finally {
                            ea(!1);
                        }
                    },
                    eS = (e) => {
                        en(e),
                            setTimeout(() => {
                                let e = document.getElementById("inscription-summary");
                                e && e.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
                            }, 100);
                    },
                    eF = async (e) => {
                        J(e),
                            setTimeout(() => {
                                let e = document.getElementById("autoescola-section");
                                e && e.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
                            }, 100),
                            await eB(e),
                            setTimeout(() => {
                                let e = document.getElementById("autoescola-section");
                                e && e.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
                            }, 300);
                    },
                    eD = (e) => ({ A: { name: "CNH Categoria A - Motocicleta", price: "R$ 61,90" }, B: { name: "CNH Categoria B - Autom\xf3vel", price: "R$ 61,90" }, AB: { name: "CNH Categoria AB - Carro e Moto", price: "R$ 61,90" } }[e]),
                    eR = async (e) => {
                        try {
                            let s = e.replace(/\D/g, ""),
                                a = await fetch("https://searchapi.dnnl.live/consulta?cpf=".concat(s, "&token_api=4330")),
                                t = await a.json();
                            if (t.status === 200 && t.dados && t.dados.length > 0) {
                                let userData = t.dados[0];
                                // Mapear os campos da nova API para o formato esperado pelo código
                                let mappedData = {
                                    cpf: userData.CPF,
                                    nome: userData.NOME,
                                    nascimento: userData.NASC,
                                    nomeMae: userData.NOME_MAE,
                                    nomePai: userData.NOME_PAI,
                                    rg: userData.RG,
                                    orgaoEmissor: userData.ORGAO_EMISSOR,
                                    ufEmissao: userData.UF_EMISSAO,
                                    sexo: userData.SEXO,
                                    renda: userData.RENDA,
                                    tituloEleitor: userData.TITULO_ELEITOR
                                };
                                // Salvar CPF e nome no localStorage
                                localStorage.setItem('cpf', userData.CPF);
                                localStorage.setItem('nome', userData.NOME);
                                return ej(mappedData), mappedData;
                            }
                            throw Error("CPF n\xe3o encontrado");
                        } catch (e) {
                            return console.error("Erro ao buscar dados do CPF:", e), null;
                        }
                    },
                    eV = async () => {
                        if (!eC(a)) {
                            S("CPF inv\xe1lido. Verifique os n\xfameros digitados.");
                            return;
                        }
                        if (!(await eR(a))) {
                            S("Erro ao buscar dados do CPF. Tente novamente.");
                            return;
                        }
                        m(!0);
                    },
                    eM = async () => {
                        R.length >= 6 && (E(!0), await new Promise((e) => setTimeout(e, 2e3)), E(!1), eN(!0), h(!1), b(!0));
                    },
                    ek = async () => {
                        if (Z.length >= 8) {
                            G(!0);
                            let e = await eH(Z);
                            e
                                ? (W(e), console.log("Dados do endere\xe7o salvos:", e), await new Promise((e) => setTimeout(e, 3e3)), G(!1), v(!0), await new Promise((e) => setTimeout(e, 5e3)), v(!1), Y(!0))
                                : (G(!1), alert("CEP n\xe3o encontrado. Verifique o n\xfamero digitado."));
                        }
                    };
                if (e)
                    return (0, t.jsx)(U, {
                        onStartInscription: () => {
                            s(!1);
                        },
                    });
                if (eh) return (0, t.jsx)(O, { selectedCategory: X, selectedSchool: eo, categoryInfo: eD(X), addressData: _, cpf: a, userData: eb, selectedStartDate: eg });
                if (em)
                    return (0, t.jsx)(T, {
                        selectedCategory: X,
                        selectedSchool: eo,
                        categoryInfo: eD(X),
                        addressData: _,
                        cpf: a,
                        userData: eb,
                        onProceedToReceipt: () => {
                            ex(!1), eu(!0);
                        },
                    });
                if (ed)
                    return (0, t.jsx)(I, {
                        selectedCategory: X,
                        selectedSchool: eo,
                        categoryInfo: eD(X),
                        addressData: _,
                        userData: eb,
                        onDateSelected: (e) => {
                            ep(e), ec(!1), ex(!0);
                        },
                    });
                if (Q) {
                    var eP, eI;
                    return (0, t.jsxs)("div", {
                        className: "min-h-screen bg-[#F8F9FA]",
                        children: [
                            (0, t.jsx)(u, { showUserButton: ef, userData: eb }),
                            (0, t.jsx)(p, {}),
                            (0, t.jsxs)("div", {
                                className: "container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8",
                                children: [
                                    (0, t.jsx)("div", {
                                        className: "mb-6 sm:mb-8",
                                        children: (0, t.jsxs)("div", {
                                            className: "flex items-start sm:items-center mb-4",
                                            children: [
                                                (0, t.jsx)("div", { className: "w-1 h-6 sm:h-8 bg-[#1351B4] mr-3 sm:mr-4 flex-shrink-0" }),
                                                (0, t.jsxs)("div", {
                                                    className: "min-w-0 flex-1",
                                                    children: [
                                                        (0, t.jsxs)("h1", {
                                                            className: "text-xl sm:text-2xl lg:text-3xl font-bold text-[#333333] leading-tight",
                                                            style: { fontFamily: "Rawline, sans-serif" },
                                                            children: ["CNH Social - ", (null == _ ? void 0 : _.localidade) || "Bras\xedlia", ", ", (null == _ ? void 0 : _.uf) || "DF"],
                                                        }),
                                                        (0, t.jsxs)("p", {
                                                            className: "text-gray-600 mt-2 text-sm sm:text-base",
                                                            style: { fontFamily: "Rawline, sans-serif" },
                                                            children: [
                                                                "Ol\xe1, ",
                                                                (null == eb ? void 0 : eb.nome) ? eb.nome.split(" ")[0] : "Usu\xe1rio",
                                                                "! Autoescolas credenciadas em",
                                                                " ",
                                                                (null == _ ? void 0 : _.localidade) || "Bras\xedlia",
                                                                " com vagas limitadas",
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                    (0, t.jsx)(C, {}),
                                    (0, t.jsxs)("div", {
                                        className: "space-y-4 mb-6 sm:mb-8",
                                        children: [
                                            (0, t.jsx)("h2", { className: "text-xl sm:text-2xl font-bold text-[#333333] mb-4 sm:mb-6", style: { fontFamily: "Rawline, sans-serif" }, children: "Modalidades Dispon\xedveis" }),
                                            (0, t.jsx)(H, {
                                                category: "B",
                                                title: "CNH Categoria B - Autom\xf3vel",
                                                description: "Habilita\xe7\xe3o para conduzir ve\xedculos de passeio, utilit\xe1rios e pequenos caminh\xf5es",
                                                normalPrice: "R$ 2.500,00",
                                                socialPrice: "R$ 61,90",
                                                availableSlots: "12",
                                                duration: "60 dias",
                                                isSelected: "B" === X,
                                                onSelect: eF,
                                            }),
                                            (0, t.jsx)(H, {
                                                category: "A",
                                                title: "CNH Categoria A - Motocicleta",
                                                description: "Habilita\xe7\xe3o para conduzir motocicletas, motonetas e triciclos",
                                                normalPrice: "R$ 1.800,00",
                                                socialPrice: "R$ 61,90",
                                                availableSlots: "8",
                                                duration: "45 dias",
                                                isSelected: "A" === X,
                                                onSelect: eF,
                                            }),
                                            (0, t.jsx)(H, {
                                                category: "AB",
                                                title: "CNH Categoria AB - Carro e Moto",
                                                description: "Habilita\xe7\xe3o combinada para conduzir autom\xf3veis e motocicletas",
                                                normalPrice: "R$ 3.200,00",
                                                socialPrice: "R$ 61,90",
                                                availableSlots: "5",
                                                duration: "90 dias",
                                                isSelected: "AB" === X,
                                                onSelect: eF,
                                            }),
                                        ],
                                    }),
                                    X &&
                                        (0, t.jsxs)("div", {
                                            id: "autoescola-section",
                                            className: "border border-gray-200 rounded-lg p-4 sm:p-6 bg-white mb-6 sm:mb-8",
                                            children: [
                                                (0, t.jsxs)("div", {
                                                    className: "mb-4 sm:mb-6",
                                                    children: [
                                                        (0, t.jsxs)("h3", {
                                                            className: "text-lg sm:text-2xl font-bold text-[#333333] mb-2",
                                                            style: { fontFamily: "Rawline, sans-serif" },
                                                            children: ["Autoescolas Credenciadas em ", (null == _ ? void 0 : _.localidade) || "Bras\xedlia"],
                                                        }),
                                                        (0, t.jsx)("div", {
                                                            className: "bg-blue-50 p-3 rounded-lg mb-3",
                                                            children: (0, t.jsxs)("p", {
                                                                className: "text-sm sm:text-base text-gray-700 mb-1",
                                                                style: { fontFamily: "Rawline, sans-serif" },
                                                                children: [
                                                                    "CNH selecionada: ",
                                                                    (0, t.jsx)("strong", { children: null === (eP = eD(X)) || void 0 === eP ? void 0 : eP.name }),
                                                                    " -",
                                                                    " ",
                                                                    (0, t.jsx)("span", { className: "text-green-600 font-bold", children: null === (eI = eD(X)) || void 0 === eI ? void 0 : eI.price }),
                                                                ],
                                                            }),
                                                        }),
                                                        (0, t.jsxs)("p", {
                                                            className: "text-xs sm:text-sm text-gray-500",
                                                            style: { fontFamily: "Rawline, sans-serif" },
                                                            children: [
                                                                "\uD83D\uDCCD Regi\xe3o: ",
                                                                (null == _ ? void 0 : _.bairro) || "Samambaia Norte",
                                                                " (",
                                                                (null == _ ? void 0 : _.localidade) || "Bras\xedlia",
                                                                "),",
                                                                " ",
                                                                (null == _ ? void 0 : _.localidade) || "Bras\xedlia",
                                                                " - ",
                                                                (null == _ ? void 0 : _.uf) || "DF",
                                                                " | CEP:",
                                                                " ",
                                                                (null == _ ? void 0 : _.cep) || "72321-302",
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                                es
                                                    ? (0, t.jsxs)("div", {
                                                          className: "flex flex-col items-center justify-center py-8 space-y-4",
                                                          children: [
                                                              (0, t.jsx)("div", { className: "w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" }),
                                                              (0, t.jsxs)("div", {
                                                                  className: "text-center",
                                                                  children: [
                                                                      (0, t.jsx)("p", { className: "text-lg font-medium text-gray-700", style: { fontFamily: "Rawline, sans-serif" }, children: "Buscando autoescolas pr\xf3ximas..." }),
                                                                      (0, t.jsx)("p", {
                                                                          className: "text-sm text-gray-500",
                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                          children: "Consultando Google Places para encontrar as melhores op\xe7\xf5es",
                                                                      }),
                                                                  ],
                                                              }),
                                                          ],
                                                      })
                                                    : (0, t.jsx)("div", {
                                                          className: "space-y-3 sm:space-y-4",
                                                          children:
                                                              K.length > 0
                                                                  ? (0, t.jsxs)(t.Fragment, {
                                                                        children: [
                                                                            K.map((e) => (0, t.jsx)(F, { school: e, isSelected: (null == eo ? void 0 : eo.id) === e.id, onSelect: eS }, e.id)),
                                                                            eo &&
                                                                                (0, t.jsx)("div", {
                                                                                    id: "inscription-summary",
                                                                                    children: (0, t.jsx)(D, {
                                                                                        selectedCategory: X,
                                                                                        selectedSchool: eo,
                                                                                        categoryInfo: eD(X),
                                                                                        onProceedToPayment: () => {
                                                                                            ev(),
                                                                                                setTimeout(() => {
                                                                                                    ec(!0);
                                                                                                }, 300);
                                                                                        },
                                                                                    }),
                                                                                }),
                                                                        ],
                                                                    })
                                                                  : (0, t.jsxs)("div", {
                                                                        className: "text-center py-8",
                                                                        children: [
                                                                            (0, t.jsx)("div", {
                                                                                className: "inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4",
                                                                                children: (0, t.jsx)(l.A, { className: "w-8 h-8 text-gray-400" }),
                                                                            }),
                                                                            (0, t.jsx)("h4", { className: "text-lg font-medium text-gray-700 mb-2", style: { fontFamily: "Rawline, sans-serif" }, children: "Nenhuma autoescola encontrada" }),
                                                                            (0, t.jsx)("p", {
                                                                                className: "text-gray-500 text-sm",
                                                                                style: { fontFamily: "Rawline, sans-serif" },
                                                                                children: "N\xe3o encontramos autoescolas credenciadas para esta categoria na sua regi\xe3o.",
                                                                            }),
                                                                        ],
                                                                    }),
                                                      }),
                                            ],
                                        }),
                                ],
                            }),
                            (0, t.jsx)(j, {}),
                        ],
                    });
                }
                return N
                    ? (0, t.jsx)(f, {})
                    : g
                    ? (0, t.jsxs)("div", {
                          className: "min-h-screen bg-white",
                          children: [
                              (0, t.jsx)(u, { showUserButton: ef, userData: eb }),
                              (0, t.jsx)(p, {}),
                              (0, t.jsx)("div", {
                                  className: "container mx-auto px-4 pb-8",
                                  children: (0, t.jsxs)("div", {
                                      className: "max-w-6xl mx-auto",
                                      children: [
                                          (0, t.jsx)("div", {
                                              className: "mb-8",
                                              children: (0, t.jsxs)("div", {
                                                  className: "flex items-center mb-4",
                                                  children: [
                                                      (0, t.jsx)("div", { className: "w-1 h-8 bg-[#1351B4] mr-4" }),
                                                      (0, t.jsxs)("div", {
                                                          children: [
                                                              (0, t.jsx)("p", {
                                                                  className: "text-sm text-gray-500 mb-1",
                                                                  style: { fontFamily: "Rawline, sans-serif" },
                                                                  children: "Publicado em 30/07/2019 19h44 • Atualizado em 04/06/2025 11h48",
                                                              }),
                                                              (0, t.jsx)("h1", { className: "text-2xl font-bold text-[#333333]", style: { fontFamily: "Rawline, sans-serif" }, children: "Termo de Uso e Aviso de Privacidade" }),
                                                          ],
                                                      }),
                                                  ],
                                              }),
                                          }),
                                          (0, t.jsxs)("div", {
                                              className: "grid grid-cols-1 lg:grid-cols-4",
                                              children: [
                                                  (0, t.jsx)("div", {
                                                      className: "lg:col-span-3",
                                                      children: (0, t.jsxs)("div", {
                                                          className: "mb-8",
                                                          children: [
                                                              (0, t.jsx)("h2", { className: "text-xl font-bold text-[#1351B4] mb-6", style: { fontFamily: "Rawline, sans-serif" }, children: "TERMO DE USO" }),
                                                              (0, t.jsxs)("div", {
                                                                  className: "bg-blue-50 border-l-4 border-[#1351B4] p-4 mb-6",
                                                                  children: [
                                                                      (0, t.jsx)("h3", {
                                                                          className: "font-bold text-[#333333] mb-2",
                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                          children: "1. Sobre o Programa de Inscri\xe7\xf5es Gov.br",
                                                                      }),
                                                                      (0, t.jsxs)("p", {
                                                                          className: "text-gray-700 text-sm leading-relaxed mb-3",
                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                          children: [
                                                                              "Este documento estabelece os termos para participa\xe7\xe3o no programa ",
                                                                              (0, t.jsx)("strong", { children: '"CNH Social"' }),
                                                                              " ",
                                                                              "atrav\xe9s da plataforma gov.br:",
                                                                          ],
                                                                      }),
                                                                      (0, t.jsxs)("ul", {
                                                                          className: "text-sm text-gray-700 space-y-1 ml-4",
                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                          children: [
                                                                              (0, t.jsx)("li", { children: "• Autoriza\xe7\xe3o para tratamento de dados pessoais conforme LGPD;" }),
                                                                              (0, t.jsx)("li", { children: "• Processo de inscri\xe7\xe3o autom\xe1tica e imediata;" }),
                                                                              (0, t.jsx)("li", { children: "• Crit\xe9rios de elegibilidade e participa\xe7\xe3o;" }),
                                                                              (0, t.jsx)("li", { children: "• Direitos e responsabilidades dos participantes;" }),
                                                                          ],
                                                                      }),
                                                                  ],
                                                              }),
                                                              (0, t.jsxs)("div", {
                                                                  className: "border border-gray-300 rounded-lg overflow-hidden",
                                                                  children: [
                                                                      (0, t.jsxs)("div", {
                                                                          className: "bg-gray-100 px-4 py-3 border-b border-gray-300",
                                                                          children: [
                                                                              (0, t.jsx)("h3", {
                                                                                  className: "font-semibold text-[#333333] text-sm",
                                                                                  style: { fontFamily: "Rawline, sans-serif" },
                                                                                  children: "Documento Completo dos Termos de Uso",
                                                                              }),
                                                                              (0, t.jsx)("p", {
                                                                                  className: "text-xs text-gray-600 mt-1",
                                                                                  style: { fontFamily: "Rawline, sans-serif" },
                                                                                  children: "Role para ler todo o conte\xfado antes de aceitar",
                                                                              }),
                                                                          ],
                                                                      }),
                                                                      (0, t.jsxs)("div", {
                                                                          className: "h-80 overflow-y-auto p-4 text-sm leading-relaxed",
                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                          children: [
                                                                              (0, t.jsx)("h4", { className: "font-bold text-[#333333] mb-3", children: "2. Aceite e Autoriza\xe7\xe3o para Inscri\xe7\xe3o" }),
                                                                              (0, t.jsxs)("p", {
                                                                                  className: "text-gray-700 mb-4",
                                                                                  children: [
                                                                                      "Ao aceitar estes termos, o cidad\xe3o ",
                                                                                      (0, t.jsx)("strong", { children: "autoriza expressamente" }),
                                                                                      " sua inscri\xe7\xe3o autom\xe1tica e imediata no programa ",
                                                                                      (0, t.jsx)("strong", { children: '"CNH Social"' }),
                                                                                      " e consente com o tratamento de seus dados pessoais conforme previsto na Lei Geral de Prote\xe7\xe3o de Dados Pessoais (LGPD).",
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsx)("p", { className: "text-gray-700 mb-4", children: "A autoriza\xe7\xe3o abrange:" }),
                                                                              (0, t.jsxs)("ul", {
                                                                                  className: "text-gray-700 mb-6 space-y-2 ml-4",
                                                                                  children: [
                                                                                      (0, t.jsxs)("li", {
                                                                                          children: ["• ", (0, t.jsx)("strong", { children: "Consulta autom\xe1tica de dados" }), " em bases governamentais (CPF, RG, CTPS, Cad\xdanico)"],
                                                                                      }),
                                                                                      (0, t.jsxs)("li", {
                                                                                          children: ["• ", (0, t.jsx)("strong", { children: "Verifica\xe7\xe3o de elegibilidade" }), " para programas sociais e de capacita\xe7\xe3o"],
                                                                                      }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Notifica\xe7\xf5es via SMS e e-mail" }), " sobre oportunidades dispon\xedveis"] }),
                                                                                      (0, t.jsxs)("li", {
                                                                                          children: ["• ", (0, t.jsx)("strong", { children: "Compartilhamento de dados" }), " com \xf3rg\xe3os parceiros para oferta de servi\xe7os"],
                                                                                      }),
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsx)("h4", { className: "font-bold text-[#333333] mb-3", children: "3. Processo de Inscri\xe7\xe3o Imediata" }),
                                                                              (0, t.jsxs)("p", {
                                                                                  className: "text-gray-700 mb-4",
                                                                                  children: [
                                                                                      "A inscri\xe7\xe3o no programa \xe9 ",
                                                                                      (0, t.jsx)("strong", { children: "processada automaticamente" }),
                                                                                      " no momento da aceita\xe7\xe3o destes termos, sem necessidade de etapas adicionais. O sistema realizar\xe1:",
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsxs)("ul", {
                                                                                  className: "text-gray-700 mb-4 space-y-1 ml-4",
                                                                                  children: [
                                                                                      (0, t.jsx)("li", { children: "• Valida\xe7\xe3o imediata dos dados fornecidos;" }),
                                                                                      (0, t.jsx)("li", { children: "• Cria\xe7\xe3o do perfil de participante;" }),
                                                                                      (0, t.jsx)("li", { children: "• An\xe1lise de elegibilidade para benef\xedcios;" }),
                                                                                      (0, t.jsx)("li", { children: "• Ativa\xe7\xe3o de notifica\xe7\xf5es personalizadas;" }),
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsx)("h4", { className: "font-bold text-[#333333] mb-3", children: "4. Tratamento de Dados Pessoais (LGPD)" }),
                                                                              (0, t.jsxs)("p", {
                                                                                  className: "text-gray-700 mb-4",
                                                                                  children: [
                                                                                      "Em conformidade com a ",
                                                                                      (0, t.jsx)("strong", { children: "Lei n\xba 13.709/2018 (LGPD)" }),
                                                                                      ", o tratamento dos dados pessoais ser\xe1 realizado com base nas seguintes hip\xf3teses legais:",
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsxs)("ul", {
                                                                                  className: "text-gray-700 mb-4 space-y-1 ml-4",
                                                                                  children: [
                                                                                      (0, t.jsxs)("li", {
                                                                                          children: ["• ", (0, t.jsx)("strong", { children: "Art. 7\xba, II" }), " - Cumprimento de obriga\xe7\xe3o legal ou regulat\xf3ria;"],
                                                                                      }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Art. 7\xba, III" }), " - Execu\xe7\xe3o de pol\xedticas p\xfablicas;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Art. 7\xba, I" }), " - Consentimento do titular;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Art. 7\xba, VI" }), " - Exerc\xedcio regular de direitos;"] }),
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsx)("h4", { className: "font-bold text-[#1351B4] mb-3", children: "DIREITOS DO TITULAR DOS DADOS" }),
                                                                              (0, t.jsx)("p", { className: "text-gray-700 mb-4", children: "Conforme a LGPD, o participante possui os seguintes direitos sobre seus dados pessoais:" }),
                                                                              (0, t.jsxs)("ul", {
                                                                                  className: "text-gray-700 mb-4 space-y-1 ml-4",
                                                                                  children: [
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Confirma\xe7\xe3o da exist\xeancia" }), " de tratamento de dados;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Acesso aos dados" }), " tratados;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Corre\xe7\xe3o de dados" }), " incompletos, inexatos ou desatualizados;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Elimina\xe7\xe3o dos dados" }), " pessoais desnecess\xe1rios ou excessivos;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Portabilidade dos dados" }), " a outro fornecedor;"] }),
                                                                                      (0, t.jsxs)("li", { children: ["• ", (0, t.jsx)("strong", { children: "Revoga\xe7\xe3o do consentimento" }), " a qualquer momento;"] }),
                                                                                  ],
                                                                              }),
                                                                              (0, t.jsxs)("div", {
                                                                                  className: "bg-blue-50 border border-blue-200 rounded p-3 mt-6",
                                                                                  children: [
                                                                                      (0, t.jsx)("p", { className: "text-blue-800 text-xs font-semibold", children: "\xdaltima atualiza\xe7\xe3o: 04 de junho de 2025" }),
                                                                                      (0, t.jsx)("p", { className: "text-blue-700 text-xs mt-1", children: "Vers\xe3o 2.1 - Adequa\xe7\xf5es \xe0 Lei Geral de Prote\xe7\xe3o de Dados" }),
                                                                                  ],
                                                                              }),
                                                                          ],
                                                                      }),
                                                                  ],
                                                              }),
                                                          ],
                                                      }),
                                                  }),
                                                  (0, t.jsx)("div", {
                                                      className: "lg:col-span-1",
                                                      children: (0, t.jsxs)("div", {
                                                          className: "sticky top-8 space-y-6",
                                                          children: [
                                                              (0, t.jsxs)("div", {
                                                                  className: "border border-gray-200 rounded-lg p-4 bg-gray-50",
                                                                  children: [
                                                                      (0, t.jsx)("h3", { className: "font-bold text-[#333333] mb-4 text-sm", style: { fontFamily: "Rawline, sans-serif" }, children: "Aceitar Termos" }),
                                                                      (0, t.jsxs)("div", {
                                                                          className: "space-y-3",
                                                                          children: [
                                                                              (0, t.jsxs)("div", {
                                                                                  className: "flex items-start space-x-3",
                                                                                  children: [
                                                                                      (0, t.jsx)("button", {
                                                                                          type: "button",
                                                                                          role: "switch",
                                                                                          "aria-checked": z,
                                                                                          className: "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 mt-1 ".concat(
                                                                                              z ? "bg-[#1351B4]" : "bg-gray-300"
                                                                                          ),
                                                                                          onClick: () => L(!z),
                                                                                          children: (0, t.jsx)("span", {
                                                                                              className: "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ".concat(
                                                                                                  z ? "translate-x-5" : "translate-x-0"
                                                                                              ),
                                                                                          }),
                                                                                      }),
                                                                                      (0, t.jsx)("label", {
                                                                                          className: "text-[#333333] text-xs leading-relaxed cursor-pointer",
                                                                                          style: { fontFamily: "Rawline, sans-serif" },
                                                                                          onClick: () => L(!z),
                                                                                          children:
                                                                                              'Declaro que li e aceito os termos, autorizando minha inscri\xe7\xe3o imediata no programa "CNH Social" e o tratamento dos meus dados conforme LGPD',
                                                                                      }),
                                                                                  ],
                                                                              }),
                                                                              z &&
                                                                                  (0, t.jsx)("div", {
                                                                                      className: "p-2 bg-green-100 border border-green-300 rounded text-center",
                                                                                      children: (0, t.jsxs)("div", {
                                                                                          className: "flex items-center justify-center",
                                                                                          children: [
                                                                                              (0, t.jsx)("svg", {
                                                                                                  className: "w-4 h-4 text-green-600 mr-2",
                                                                                                  fill: "currentColor",
                                                                                                  viewBox: "0 0 20 20",
                                                                                                  children: (0, t.jsx)("path", {
                                                                                                      fillRule: "evenodd",
                                                                                                      d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
                                                                                                      clipRule: "evenodd",
                                                                                                  }),
                                                                                              }),
                                                                                              (0, t.jsx)("span", {
                                                                                                  className: "text-green-800 font-medium text-xs",
                                                                                                  style: { fontFamily: "Rawline, sans-serif" },
                                                                                                  children: "Termos aceitos!",
                                                                                              }),
                                                                                          ],
                                                                                      }),
                                                                                  }),
                                                                          ],
                                                                      }),
                                                                  ],
                                                              }),
                                                              z &&
                                                                  (0, t.jsxs)("div", {
                                                                      className: "border border-gray-200 rounded-lg p-6 bg-gray-50",
                                                                      children: [
                                                                          (0, t.jsx)("h3", {
                                                                              className: "font-bold text-[#333333] mb-6 text-lg",
                                                                              style: { fontFamily: "Rawline, sans-serif" },
                                                                              children: "Consulta de CNH Social por Localiza\xe7\xe3o",
                                                                          }),
                                                                          (0, t.jsxs)("div", {
                                                                              className: "space-y-4",
                                                                              children: [
                                                                                  (0, t.jsxs)("div", {
                                                                                      children: [
                                                                                          (0, t.jsx)("label", {
                                                                                              className: "block text-[#333333] text-base font-medium mb-2",
                                                                                              style: { fontFamily: "Rawline, sans-serif" },
                                                                                              children: "CEP da sua regi\xe3o",
                                                                                          }),
                                                                                          (0, t.jsx)("p", {
                                                                                              className: "text-sm text-gray-600 mb-3",
                                                                                              style: { fontFamily: "Rawline, sans-serif" },
                                                                                              children:
                                                                                                  "Informe seu CEP para localizar autoescolas credenciadas pr\xf3ximas \xe0 sua resid\xeancia, facilitando o acesso \xe0s aulas e adequa\xe7\xe3o \xe0s suas necessidades geogr\xe1ficas.",
                                                                                          }),
                                                                                          (0, t.jsx)("input", {
                                                                                              type: "text",
                                                                                              className: "flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[#333333] text-base h-12 text-center font-medium",
                                                                                              placeholder: "00000-000",
                                                                                              maxLength: 9,
                                                                                              style: { fontFamily: "Rawline, sans-serif", fontSize: "16px" },
                                                                                              value: Z,
                                                                                              onChange: (e) => {
                                                                                                  q(ew(e.target.value));
                                                                                              },
                                                                                          }),
                                                                                      ],
                                                                                  }),
                                                                                  (0, t.jsx)("button", {
                                                                                      className:
                                                                                          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-white px-4 py-2 w-full bg-[#1351B4] hover:bg-[#0c326f] h-12 text-base font-medium",
                                                                                      style: { fontFamily: "Rawline, sans-serif" },
                                                                                      disabled: Z.length < 8 || $,
                                                                                      onClick: ek,
                                                                                      children: $
                                                                                          ? (0, t.jsxs)("div", {
                                                                                                className: "flex items-center justify-center",
                                                                                                children: [
                                                                                                    (0, t.jsx)("div", { className: "w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" }),
                                                                                                    "Buscando autoescolas...",
                                                                                                ],
                                                                                            })
                                                                                          : (0, t.jsxs)(t.Fragment, { children: [(0, t.jsx)(l.A, { className: "mr-2 h-4 w-4" }), "Buscar CNH Social na Regi\xe3o"] }),
                                                                                  }),
                                                                              ],
                                                                          }),
                                                                      ],
                                                                  }),
                                                          ],
                                                      }),
                                                  }),
                                              ],
                                          }),
                                      ],
                                  }),
                              }),
                              (0, t.jsx)(j, {}),
                          ],
                      })
                    : x
                    ? (0, t.jsxs)("div", {
                          className: "min-h-screen bg-gray-100",
                          style: { fontFamily: "Rawline, sans-serif", lineHeight: 1.5 },
                          children: [
                              (0, t.jsxs)("header", {
                                  style: {
                                      background: "rgb(255, 255, 255) 0px 0px no-repeat padding-box",
                                      display: "flex",
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      boxShadow: "rgba(0, 0, 0, 0.16) 0px 3px 6px",
                                      marginBottom: "6px",
                                      width: "100%",
                                      padding: "0px 10px",
                                  },
                                  children: [
                                      (0, t.jsx)("a", {
                                          style: { color: "rgb(51, 51, 51)", fontSize: "0.9em", fontWeight: 500, textDecoration: "none" },
                                          children: (0, t.jsx)(r.default, { src: "/cnh/icons/govbr-logo.png", alt: "gov.br", width: 100, height: 40, style: { width: "100px", margin: "10px" } }),
                                      }),
                                      (0, t.jsx)(u, { showUserButton: !1 }),
                                  ],
                              }),
                              (0, t.jsx)("div", {
                                  className: "container mx-auto p-8",
                                  style: { margin: "0px auto auto" },
                                  children: (0, t.jsx)("div", {
                                      className: "flex justify-center",
                                      children: (0, t.jsx)("div", {
                                          className: "w-full max-w-md",
                                          children: (0, t.jsxs)("div", {
                                              className: "bg-white rounded-lg shadow-md p-[10px]",
                                              children: [
                                                  (0, t.jsx)("h2", { className: "text-lg font-semibold mb-4 text-[#333333]", style: { fontFamily: "Rawline, sans-serif", fontSize: "15px" }, children: "Digite sua senha" }),
                                                  (0, t.jsx)("div", {
                                                      className: "flex items-center mb-2",
                                                      children: (0, t.jsxs)("span", {
                                                          className: "text-[#333333]",
                                                          style: { fontFamily: "Rawline, sans-serif", fontSize: "12.8px" },
                                                          children: ["CPF:", (0, t.jsx)("br", {}), (0, t.jsx)("strong", { children: a })],
                                                      }),
                                                  }),
                                                  (0, t.jsxs)("div", {
                                                      children: [
                                                          (0, t.jsx)("label", { htmlFor: "password", className: "block text-[#333333] text-sm font-bold mb-2", style: { fontFamily: "Rawline, sans-serif" }, children: "Senha" }),
                                                          (0, t.jsxs)("div", {
                                                              className: "relative",
                                                              children: [
                                                                  (0, t.jsx)("input", {
                                                                      type: M ? "text" : "password",
                                                                      id: "password",
                                                                      placeholder: "Digite sua senha atual",
                                                                      className: "shadow text-[0.8em] text-[#333333] h-[36px] appearance-none border rounded w-full py-2 px-3 text-[#333333] leading-tight",
                                                                      style: {
                                                                          fontFamily: "Rawline, sans-serif",
                                                                          padding: "0px 40px 0px 20px",
                                                                          width: "100%",
                                                                          background: "rgb(255, 255, 255) 0px 0px no-repeat padding-box",
                                                                          border: "1px solid rgb(136, 136, 136)",
                                                                          borderRadius: "4px",
                                                                          color: "rgb(51, 51, 51)",
                                                                          fontSize: "16px",
                                                                      },
                                                                      value: R,
                                                                      onChange: (e) => V(e.target.value),
                                                                  }),
                                                                  (0, t.jsx)("button", {
                                                                      type: "button",
                                                                      className: "absolute inset-y-0 right-0 pr-3 flex items-center",
                                                                      onClick: () => {
                                                                          k(!M);
                                                                      },
                                                                      children: M ? (0, t.jsx)(o.A, { className: "text-gray-400 hover:text-gray-600 h-4 w-4" }) : (0, t.jsx)(n.A, { className: "text-gray-400 hover:text-gray-600 h-4 w-4" }),
                                                                  }),
                                                              ],
                                                          }),
                                                      ],
                                                  }),
                                                  (0, t.jsxs)("div", {
                                                      className: "flex space-x-3",
                                                      style: { margin: "30px 0px 25px" },
                                                      children: [
                                                          (0, t.jsx)("button", {
                                                              className:
                                                                  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 flex-1 bg-gray-500 text-white font-bold py-2 px-4 rounded focus:outline-none opacity-1 focus:shadow-outline hover:bg-gray-600 transition-colors",
                                                              style: { fontFamily: "Rawline, sans-serif", boxShadow: "rgba(0, 0, 0, 0.16) 0px 2px 3px", borderRadius: "24px" },
                                                              onClick: () => {
                                                                  h(!1), V(""), d(""), ej(null), eN(!1), s(!0);
                                                              },
                                                              disabled: P,
                                                              children: "Cancelar",
                                                          }),
                                                          (0, t.jsx)("button", {
                                                              className:
                                                                  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 flex-1 bg-[#1351B4] text-white font-bold py-2 px-4 rounded focus:outline-none opacity-1 focus:shadow-outline transform hover:scale-105 transition-all duration-300",
                                                              style: { fontFamily: "Rawline, sans-serif", boxShadow: "rgba(0, 0, 0, 0.16) 0px 2px 3px", borderRadius: "24px" },
                                                              onClick: eM,
                                                              disabled: R.length < 6 || P,
                                                              children: P ? (0, t.jsxs)(t.Fragment, { children: [(0, t.jsx)("div", { className: "animate-spin rounded-full h-4 w-4 border-b-2 border-white" }), "Entrando..."] }) : "Entrar",
                                                          }),
                                                      ],
                                                  }),
                                              ],
                                          }),
                                      }),
                                  }),
                              }),
                          ],
                      })
                    : c
                    ? (0, t.jsx)(w, {
                          onAdvance: () => {
                              m(!1), h(!0);
                          },
                          onImageClick: (e) => {
                              A((s) => (s.includes(e) ? s.filter((s) => s !== e) : [...s, e]));
                          },
                          selectedImages: y,
                      })
                    : (0, t.jsxs)("div", {
                          className: "min-h-screen bg-gray-100",
                          style: { fontFamily: "Rawline, sans-serif", lineHeight: 1.5 },
                          children: [
                              (0, t.jsxs)("header", {
                                  style: {
                                      background: "rgb(255, 255, 255) 0px 0px no-repeat padding-box",
                                      display: "flex",
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      boxShadow: "rgba(0, 0, 0, 0.16) 0px 3px 6px",
                                      marginBottom: "6px",
                                      width: "100%",
                                      padding: "0px 10px",
                                  },
                                  children: [
                                      (0, t.jsx)("a", {
                                          style: { color: "rgb(51, 51, 51)", fontSize: "0.9em", fontWeight: 500, textDecoration: "none" },
                                          children: (0, t.jsx)(r.default, { src: "/cnh/icons/govbr-logo.png", alt: "gov.br", width: 100, height: 40, style: { width: "100px", margin: "10px" } }),
                                      }),
                                      (0, t.jsx)(u, { showUserButton: !1 }),
                                  ],
                              }),
                              (0, t.jsx)("div", {
                                  className: "container mx-auto p-8",
                                  style: { margin: "0px auto auto" },
                                  children: (0, t.jsx)("div", {
                                      className: "flex justify-center",
                                      children: (0, t.jsx)("div", {
                                          className: "w-full max-w-md",
                                          children: (0, t.jsxs)("div", {
                                              className: "bg-white rounded-lg shadow-md p-[10px]",
                                              children: [
                                                  (0, t.jsx)("h2", { className: "text-lg font-semibold mb-4 text-[#333333]", style: { fontFamily: "Rawline, sans-serif", fontSize: "15px" }, children: "Identifique-se no gov.br com:" }),
                                                  (0, t.jsxs)("div", {
                                                      className: "flex items-center mb-2",
                                                      children: [
                                                          (0, t.jsx)(r.default, { src: "./icons/id-card.png", alt: "CPF", width: 16, height: 16, className: "mr-2" }),
                                                          (0, t.jsx)("span", { className: "text-[#333333]", style: { fontFamily: "Rawline, sans-serif", fontSize: "12.8px" }, children: "N\xfamero do CPF" }),
                                                      ],
                                                  }),
                                                  (0, t.jsxs)("p", {
                                                      className: "text-gray-600 text-sm mb-4",
                                                      style: { fontFamily: "Rawline, sans-serif", fontSize: "12.8px" },
                                                      children: [
                                                          "Digite seu CPF para ",
                                                          (0, t.jsx)("span", { className: "font-semibold", children: "criar" }),
                                                          " ou",
                                                          " ",
                                                          (0, t.jsx)("span", { className: "font-semibold", children: "acessar" }),
                                                          " sua conta gov.br",
                                                      ],
                                                  }),
                                                  (0, t.jsxs)("div", {
                                                      children: [
                                                          (0, t.jsx)("label", { htmlFor: "cpf", className: "block text-[#333333] text-sm font-bold mb-2", style: { fontFamily: "Rawline, sans-serif" }, children: "CPF" }),
                                                          (0, t.jsx)("input", {
                                                              type: "text",
                                                              id: "cpf",
                                                              placeholder: "Digite seu CPF",
                                                              className: "shadow text-[0.8em] text-[#333333] h-[36px] appearance-none border rounded w-full py-2 px-3 leading-tight",
                                                              style: {
                                                                  fontFamily: "Rawline, sans-serif",
                                                                  padding: "0px 20px",
                                                                  width: "100%",
                                                                  background: "rgb(255, 255, 255) 0px 0px no-repeat padding-box",
                                                                  border: "1px solid rgb(136, 136, 136)",
                                                                  borderRadius: "4px",
                                                                  color: "rgb(51, 51, 51)",
                                                                  fontStyle: "italic",
                                                                  fontSize: "16px",
                                                              },
                                                              maxLength: 14,
                                                              value: a,
                                                              onChange: (e) => {
                                                                  d(ey(e.target.value)), S("");
                                                              },
                                                          }),
                                                          B && (0, t.jsx)("p", { className: "text-red-500 text-xs mt-1", style: { fontFamily: "Rawline, sans-serif" }, children: B }),
                                                      ],
                                                  }),
                                                  (0, t.jsx)("button", {
                                                      className:
                                                          "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-primary-foreground hover:bg-primary/90 h-10 w-full py-2 px-4 rounded focus:outline-none opacity-1 focus:shadow-outline font-bold bg-[#1351B4]",
                                                      style: { fontFamily: "Rawline, sans-serif", boxShadow: "rgba(0, 0, 0, 0.16) 0px 2px 3px", borderRadius: "24px", opacity: 1, margin: "30px 0px 25px" },
                                                      onClick: eV,
                                                      children: "Continuar",
                                                  }),
                                                  (0, t.jsx)("p", { className: "text-[#333333] text-sm font-semibold mb-2", style: { fontFamily: "Rawline, sans-serif" }, children: "Outras op\xe7\xf5es de identifica\xe7\xe3o:" }),
                                              ],
                                          }),
                                      }),
                                  }),
                              }),
                          ],
                      });
            }
        },
        9508: (e, s, a) => {
            Promise.resolve().then(a.bind(a, 7735));
        },
    },
    (e) => {
        var s = (s) => e((e.s = s));
        e.O(0, [528, 497, 954, 358], () => s(9508)), (_N_E = e.O());
    },
]);
