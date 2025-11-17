#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os

class TestResultsHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save-results':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            results = json.loads(post_data.decode('utf-8'))

            # Salvar resultados em arquivo
            filename = f"pix-test-results-{results['timestamp'].replace(':', '-').replace('.', '-')}.json"
            filepath = os.path.join(os.getcwd(), filename)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)

            print(f"📄 Resultados salvos em: {filename}")
            print(f"📊 Testes passados: {results['results']['passed']}/{results['results']['total']}")

            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Resultados salvos com sucesso!')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suprimir logs do servidor
        pass

if __name__ == '__main__':
    server_address = ('localhost', 8080)
    httpd = HTTPServer(server_address, TestResultsHandler)
    print("🚀 Servidor de resultados iniciado na porta 8080")
    print("📡 Aguardando resultados dos testes PIX...")
    httpd.serve_forever()