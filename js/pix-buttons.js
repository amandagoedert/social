// Script para conectar botões de inscrição à função de pagamento PIX
(function() {
    // Aguardar o carregamento completo da página
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPixButtons);
    } else {
        initPixButtons();
    }

    function initPixButtons() {
        // Aguardar um pouco para garantir que o script principal foi carregado
        setTimeout(function() {
            // Função para adicionar event listener aos botões
            function attachPixHandler(button) {
                if (button && !button.hasAttribute('data-pix-attached')) {
                    button.setAttribute('data-pix-attached', 'true');
                    button.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Verificar se a função generatePixPayment existe
                        if (typeof generatePixPayment === 'function') {
                            generatePixPayment();
                        } else {
                            console.error('Função generatePixPayment não encontrada. Aguardando...');
                            // Tentar novamente após um delay
                            setTimeout(function() {
                                if (typeof generatePixPayment === 'function') {
                                    generatePixPayment();
                                } else {
                                    alert('Erro ao carregar sistema de pagamento. Por favor, recarregue a página.');
                                }
                            }, 1000);
                        }
                    });
                }
            }

            // Procurar por botões com texto relacionado a inscrição
            const buttons = document.querySelectorAll('button');
            buttons.forEach(function(button) {
                const buttonText = button.textContent || button.innerText || '';
                
                // Verificar se o botão contém texto relacionado a inscrição
                if (buttonText.match(/Acessar inscrições|Inscreva-se|Finalizar Inscrição|Inscrever/i)) {
                    attachPixHandler(button);
                }
            });

            // Procurar por links que parecem botões de inscrição
            const links = document.querySelectorAll('a, button');
            links.forEach(function(link) {
                const linkText = link.textContent || link.innerText || '';
                
                if (linkText.match(/Inscreva-se no CNH Social/i)) {
                    attachPixHandler(link);
                }
            });

            // Usar MutationObserver para detectar botões adicionados dinamicamente
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // Element node
                            // Verificar se o nó adicionado é um botão
                            if (node.tagName === 'BUTTON' || node.tagName === 'A') {
                                const text = node.textContent || node.innerText || '';
                                if (text.match(/Acessar inscrições|Inscreva-se|Finalizar Inscrição|Inscrever/i)) {
                                    attachPixHandler(node);
                                }
                            }
                            
                            // Verificar botões dentro do nó adicionado
                            const buttons = node.querySelectorAll ? node.querySelectorAll('button, a') : [];
                            buttons.forEach(function(button) {
                                const text = button.textContent || button.innerText || '';
                                if (text.match(/Acessar inscrições|Inscreva-se|Finalizar Inscrição|Inscrever/i)) {
                                    attachPixHandler(button);
                                }
                            });
                        }
                    });
                });
            });

            // Observar mudanças no DOM
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            console.log('✅ Sistema de botões PIX inicializado');
        }, 500);
    }
})();

