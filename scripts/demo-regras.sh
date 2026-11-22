#!/usr/bin/env bash
# Prova das regras de negócio direto na API (roteiro de demonstração, docs/ROTEIRO-DEMO.md).
# Requer banco recém-criado (docker compose down -v && docker compose up --build) e curl.
# Uso: ./scripts/demo-regras.sh [URL_DA_API]   (padrão: http://localhost:3001)
set -euo pipefail

API="${1:-http://localhost:3001}"

# Chamada autenticada que imprime a resposta e o status HTTP.
call() {
  local method=$1 token=$2 path=$3 body=${4:-}
  curl -s -X "$method" "$API$path" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    ${body:+-d "$body"} -w ' → HTTP %{http_code}\n'
}

# Igual a `call`, mas devolve só o "id" da resposta (para encadear os passos).
id_of() { call "$@" | sed -E 's/.*"id":"?([0-9]+)"?.*/\1/'; }

login() {
  curl -s "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1@mesafacil.com\",\"password\":\"123\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'
}

step() { printf '\n== %s\n' "$1"; }

GERENTE=$(login gerente)
GARCOM=$(login garcom)
COZINHA=$(login cozinha)
CAIXA=$(login caixa)
ADMIN=$(login admin)

step 'Erros padronizados: sem token → 401 com { success: false, error, code }'
curl -s "$API/tables" -w ' → HTTP %{http_code}\n'

step 'RN-02: sem turno aberto, o garçom não abre pedido (409)'
call POST "$GARCOM" /orders '{"tableId":1}'

step 'RBAC: só o gerente abre turno (garçom → 403); RN-13: sem fundo de troco → 422; com fundo de 100,00 → 201'
call POST "$GARCOM" /shifts '{"openingFloat":100}'
call POST "$GERENTE" /shifts '{}'
SHIFT=$(id_of POST "$GERENTE" /shifts '{"openingFloat":100}')
echo "turno aberto: #$SHIFT"

step 'RN-01: segundo pedido na mesma mesa → 409 (índice único parcial no PostgreSQL)'
ORDER=$(id_of POST "$GARCOM" /orders '{"tableId":1}')
echo "pedido aberto: #$ORDER"
call POST "$GARCOM" /orders '{"tableId":1}'

step 'RN-09: o item lançado guarda o preço do momento (Picanha na Chapa, 89,90)'
PICANHA=$(id_of POST "$GARCOM" "/orders/$ORDER/items" '{"menuItemId":1,"quantity":1}')
SUCO=$(id_of POST "$GARCOM" "/orders/$ORDER/items" '{"menuItemId":6,"quantity":2}')
echo "itens: #$PICANHA (picanha) e #$SUCO (suco x2)"

step 'RN-03: transição inválida open → closed → 409'
call PATCH "$CAIXA" "/orders/$ORDER/status" '{"status":"closed"}'

step 'RN-04: depois de enviado à cozinha, o item não muda (409)'
call PATCH "$GARCOM" "/orders/$ORDER/status" '{"status":"in_kitchen"}'
call PATCH "$GARCOM" "/order-items/$PICANHA/quantity" '{"quantity":3}'

step 'RN-05: item enviado só é cancelado pelo gerente (403) e com motivo (422 → 200)'
call PATCH "$GARCOM" "/order-items/$SUCO/status" '{"status":"canceled","reason":"erro"}'
call PATCH "$GERENTE" "/order-items/$SUCO/status" '{"status":"canceled","reason":"   "}'
call PATCH "$GERENTE" "/order-items/$SUCO/status" '{"status":"canceled","reason":"Sem estoque"}'

step 'RN-15: o envio à cozinha baixou a ficha técnica (Picanha 12,000 → 11,600 kg; Laranja 15,000 → 14,000 kg); o suco cancelado não devolve estoque'
call GET "$GERENTE" /ingredients | grep -oE '"name":"(Picanha|Laranja)","unit":"kg","stockQuantity":[0-9.-]+'

step 'RN-15: ajuste de estoque só do gerente (garçom → 403), com motivo (422 → 201, auditado)'
call POST "$GARCOM" /ingredients/3/adjustments '{"countedQuantity":24,"reason":"Contagem"}'
call POST "$GERENTE" /ingredients/3/adjustments '{"countedQuantity":24}'
call POST "$GERENTE" /ingredients/3/adjustments '{"countedQuantity":24,"reason":"Contagem da câmara fria"}'

step 'RN-06: a conta só é pedida com a cozinha concluída (409 → 200)'
call PATCH "$GARCOM" "/orders/$ORDER/status" '{"status":"ready_to_pay"}'
call PATCH "$COZINHA" "/order-items/$PICANHA/status" '{"status":"preparing"}'
call PATCH "$COZINHA" "/order-items/$PICANHA/status" '{"status":"ready"}'
call PATCH "$GARCOM" "/orders/$ORDER/status" '{"status":"ready_to_pay"}'

step 'RN-08/RN-12: taxa de 10% gravada no pedido, só caixa/gerente (garçom → 403; total 98,89 sem o item cancelado)'
call PATCH "$GARCOM" "/orders/$ORDER/service-tax" '{"enabled":true}'
call PATCH "$CAIXA" "/orders/$ORDER/service-tax" '{"enabled":true}'

step 'RN-07: pagamento parcial e encerramento bloqueado com saldo (409)'
call POST "$CAIXA" "/orders/$ORDER/payments" '{"amount":50,"method":"pix"}'
call PATCH "$CAIXA" "/orders/$ORDER/status" '{"status":"closed"}'

step 'RN-12: Pix acima do saldo → 422; dinheiro acima do saldo grava o troco (60,00 → troco 11,11)'
call POST "$CAIXA" "/orders/$ORDER/payments" '{"amount":60,"method":"pix"}'
call POST "$CAIXA" "/orders/$ORDER/payments" '{"amount":60,"method":"cash"}'

step 'RN-12: pedido quitado não recebe pagamento (409) nem desliga a taxa já paga (409)'
call POST "$CAIXA" "/orders/$ORDER/payments" '{"amount":1,"method":"cash"}'
call PATCH "$CAIXA" "/orders/$ORDER/service-tax" '{"enabled":false}'

step 'RN-07: saldo quitado → pedido encerrado e mesa liberada'
call PATCH "$CAIXA" "/orders/$ORDER/status" '{"status":"closed"}'

step 'RN-13: gaveta = fundo 100,00 + dinheiro líquido 48,89 = 148,89. Sangria acima → 422 (sem revelar o valor); garçom → 403'
call POST "$CAIXA" "/shifts/$SHIFT/cash-movements" '{"type":"withdrawal","amount":500,"reason":"Cofre"}'
call POST "$GARCOM" "/shifts/$SHIFT/cash-movements" '{"type":"withdrawal","amount":10,"reason":"Cofre"}'

step 'RN-13: caixa sangra 100,00 (resposta sem o esperado); gerente reforça 20,00 e vê expectedCash 68.89'
call POST "$CAIXA" "/shifts/$SHIFT/cash-movements" '{"type":"withdrawal","amount":100,"reason":"Cofre"}'
call POST "$GERENTE" "/shifts/$SHIFT/cash-movements" '{"type":"reinforcement","amount":20,"reason":"Moedas para troco"}'

OTHER=$(id_of POST "$GARCOM" /orders '{"tableId":2}')
step 'RN-02: turno com pedido ativo não pode ser encerrado (409)'
call PATCH "$GERENTE" "/shifts/$SHIFT/close"

ITEM=$(id_of POST "$GARCOM" "/orders/$OTHER/items" '{"menuItemId":1}')
call PATCH "$GARCOM" "/orders/$OTHER/status" '{"status":"in_kitchen"}' >/dev/null
step 'RN-17: caixa cancela item com a senha do gerente (senha errada → 403 sem derrubar a sessão; certa → 200 com approvedBy)'
call POST "$CAIXA" "/order-items/$ITEM/authorized-cancel" '{"reason":"Não chegou","approver":{"email":"gerente@mesafacil.com","password":"errada"}}'
call POST "$CAIXA" "/order-items/$ITEM/authorized-cancel" '{"reason":"Não chegou","approver":{"email":"gerente@mesafacil.com","password":"123"}}'

step 'RN-11: cancelar pedido exige gerente (403) e motivo (422 → 200)'
call PATCH "$GARCOM" "/orders/$OTHER/status" '{"status":"canceled","reason":"desistiu"}'
call PATCH "$GERENTE" "/orders/$OTHER/status" '{"status":"canceled"}'
call PATCH "$GERENTE" "/orders/$OTHER/status" '{"status":"canceled","reason":"Cliente desistiu"}'

step 'RN-02: turno sem pedidos ativos pode ser encerrado'
call PATCH "$GERENTE" "/shifts/$SHIFT/close"

step 'RN-10: relatório do turno derivado do banco (só gerente: caixa → 403); bloco cash com expected 68.89 e cmv (RN-15)'
call GET "$CAIXA" "/shifts/$SHIFT/report"
call GET "$GERENTE" "/shifts/$SHIFT/report"

step 'RN-16: só o admin administra usuários (gerente → 403); e-mail gravado em minúsculas'
call GET "$GERENTE" /users
NOVO=$(id_of POST "$ADMIN" /users '{"name":"Ana","email":"Ana@MesaFacil.com","role":"waiter","password":"senha-forte-1"}')
echo "usuária criada: #$NOVO"
NOVO_TOKEN=$(curl -s "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ana@mesafacil.com","password":"senha-forte-1"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
call GET "$NOVO_TOKEN" /me

step 'RN-16: desativar revoga o token na hora (401) e bloqueia o login'
call PATCH "$ADMIN" "/users/$NOVO" '{"active":false}'
call GET "$NOVO_TOKEN" /tables
curl -s "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ana@mesafacil.com","password":"senha-forte-1"}' -w ' → HTTP %{http_code}\n'

step 'RN-16: o sistema nunca fica sem admin (o admin não desativa a si mesmo → 409)'
ADMIN_ID=$(id_of GET "$ADMIN" /me)
call PATCH "$ADMIN" "/users/$ADMIN_ID" '{"active":false}'
