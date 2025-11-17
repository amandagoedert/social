const puppeteer = require('puppeteer');
const fs = require('fs');

async function runPixTests() {
    console.log('🚀 Iniciando testes automatizados do sistema PIX...');

    let browser;
    try {
        // Iniciar navegador
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Configurar console logging
        page.on('console', msg => {
            console.log(`[BROWSER] ${msg.text()}`);
        });

        // Carregar página de teste
        console.log('📄 Carregando página de teste...');
        await page.goto('http://localhost:8000/test-pix-simple.html', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Aguardar carregamento completo
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Aguardar resultados dos testes
        console.log('⏳ Aguardando execução dos testes...');
        await new Promise(resolve => setTimeout(resolve, 12000));

        // Verificar se o elemento existe e tem conteúdo
        const elementExists = await page.evaluate(() => {
            const output = document.getElementById('test-output');
            return output && output.innerHTML.trim().length > 0;
        });

        console.log('Elemento test-output existe e tem conteúdo:', elementExists);

        // Extrair resultados diretamente
        const results = await page.evaluate(() => {
            const output = document.getElementById('test-output');
            if (!output) {
                console.log('Elemento test-output não encontrado');
                return { text: 'ELEMENTO_NAO_ENCONTRADO', passed: 0, total: 0, percentage: 0 };
            }

            const text = output.textContent || output.innerHTML || '';
            console.log('Texto capturado:', text.substring(0, 200) + '...');

            // Contar sucessos e falhas baseados nas mensagens
            const successCount = (text.match(/✅/g) || []).length;
            const errorCount = (text.match(/❌/g) || []).length;
            const total = successCount + errorCount;

            return {
                text: text,
                passed: successCount,
                total: total,
                percentage: total > 0 ? ((successCount / total) * 100).toFixed(1) : 0
            };
        });

        // Salvar resultados
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `pix-test-results-${timestamp}.json`;

        const resultData = {
            timestamp: new Date().toISOString(),
            testResults: results,
            browser: 'Puppeteer Headless',
            url: 'http://localhost:8000/test-pix-simple.html',
            success: results.passed === results.total
        };

        fs.writeFileSync(filename, JSON.stringify(resultData, null, 2));
        console.log(`📄 Resultados salvos em: ${filename}`);
        console.log(`📊 Resultado: ${results.passed}/${results.total} testes passaram (${results.percentage}%)`);

        if (results.passed === results.total) {
            console.log('🎉 Todos os testes passaram! Sistema PIX funcionando corretamente.');
        } else {
            console.log('⚠️ Alguns testes falharam. Verificar implementação.');
        }

        return resultData;

    } catch (error) {
        console.error('❌ Erro durante os testes:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Executar testes
if (require.main === module) {
    runPixTests().catch(console.error);
}

module.exports = { runPixTests };