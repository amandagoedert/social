// Script para salvar resultados dos testes PIX
async function saveTestResults(results) {
    const data = {
        timestamp: new Date().toISOString(),
        results: results,
        userAgent: navigator.userAgent,
        url: window.location.href
    };

    try {
        // Enviar para servidor local
        const response = await fetch('http://localhost:8080/save-results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log('📡 Resultados enviados para servidor local com sucesso!');
        } else {
            console.log('⚠️ Erro ao enviar resultados para servidor');
        }
    } catch (error) {
        console.log('⚠️ Não foi possível conectar ao servidor local:', error.message);
        // Fallback: salvar em localStorage
        localStorage.setItem('pix_test_results', JSON.stringify(data));
        console.log('💾 Resultados salvos em localStorage como fallback');
    }
}

// Modificar a função runAllTests para salvar resultados
const originalRunAllTests = runAllTests;
window.runAllTests = async function() {
    const results = await originalRunAllTests();

    // Salvar resultados após execução
    setTimeout(() => {
        const testResults = {
            passed: 0,
            failed: 0,
            total: 5,
            details: []
        };

        // Coletar informações dos testes
        const resultElements = document.querySelectorAll('.result');
        resultElements.forEach(el => {
            if (el.id === 'all-tests-result') {
                const text = el.innerHTML;
                const passedMatch = text.match(/(\d+)\/(\d+) testes passaram/);
                if (passedMatch) {
                    testResults.passed = parseInt(passedMatch[1]);
                    testResults.total = parseInt(passedMatch[2]);
                    testResults.failed = testResults.total - testResults.passed;
                }
            }
        });

        saveTestResults(testResults);
    }, 2000);

    return results;
};