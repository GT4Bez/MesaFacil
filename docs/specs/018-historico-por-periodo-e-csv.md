# 018 — Histórico do insumo por período, por turno e em CSV

> Status: proposta · Regras: RN-15 (extensão) · Tela: Insumos (modal Histórico)

## Contexto

A spec 016 criou o histórico de movimentos do insumo, com filtro por tipo e paginação. Ela deixou de fora três pedidos do dia a dia do gerente:
- ver só um **período**, por exemplo a semana do inventário;
- ver só o **turno** de hoje, para comparar as baixas com o movimento do salão;
- **exportar** o histórico para conferir numa planilha ou mandar para o contador.

Esta spec estende a mesma rota e o mesmo modal, sem mudar o cálculo do saldo nem as regras do estoque.

## Regras

1. **Novos filtros em `GET /ingredients/:id/movements`**, opcionais e combináveis com `type`, `limit` e `before`:

   | Parâmetro | Valor | Efeito |
   | :-- | :-- | :-- |
   | `from` | data e hora ISO 8601 **com fuso** (`2026-11-23T00:00:00-03:00`) | `created_at >= from` |
   | `to` | idem | `created_at < to` (exclusivo) |
   | `shiftId` | id do turno | `shift_id = shiftId` |

   - Data sem fuso ou inválida, `from >= to` ou `shiftId` não numérico → `422`. Turno inexistente não é erro: a lista vem vazia.
   - A validação de `from`/`to` é a mesma da spec 017. Um único helper do backend atende as duas (quem for implementada primeiro o cria).
2. **O saldo não muda de regra:** `balanceAfter` continua sendo a soma acumulada de **todos** os movimentos do insumo, calculada antes de qualquer filtro (spec 016, regra 6). Com filtro de período, o primeiro movimento da lista mostra o saldo real daquele momento, não um saldo que começa do zero.
3. **Resumo do recorte:** quando algum filtro (`type`, `from`, `to` ou `shiftId`) está ativo, a resposta traz `summary`, calculado sobre **todos** os movimentos que passam no filtro (não só a página atual):
   - `count`: quantos movimentos;
   - `in`: soma das quantidades positivas;
   - `out`: soma das quantidades negativas (valor negativo);
   - `net`: `in + out`.

   Se o filtro ativo não retornar movimentos, `summary` vem zerado (`{ count: 0, in: 0, out: 0, net: 0 }`). Sem nenhum filtro ativo, `summary` é `null`. O cálculo fica no mesmo snapshot `REPEATABLE READ` da spec 016.
4. **Exportação CSV:** `GET /ingredients/:id/movements.csv`, com os mesmos papéis e os mesmos filtros (`type`, `from`, `to`, `shiftId`), sem `limit` nem `before`.
   - Exporta todos os movimentos do recorte, do **mais antigo para o mais recente** (ordem de planilha).
   - Limite de 10.000 linhas. Acima disso → `422` com a mensagem "O recorte tem mais de 10.000 movimentos. Diminua o período."
   - Mesmos erros da rota JSON: `401`, `403`, `404` e `422`. Os erros continuam no envelope JSON; só o sucesso é CSV.
5. **Formato do arquivo**, pensado para abrir direto no Excel e no LibreOffice em português:
   - `Content-Type: text/csv; charset=utf-8`, com BOM UTF-8 no início;
   - `Content-Disposition: attachment; filename="historico-<nome-do-insumo>-<AAAA-MM-DD>.csv"`, com o nome em minúsculas, sem acento e com hífens, e a data de hoje no servidor;
   - separador `;`, decimais com vírgula e sem separador de milhar; linhas terminadas em `\r\n`;
   - data e hora em ISO 8601 com fuso (`Z` ou `±HH:MM`, ex.: `2026-11-23T19:42:10-03:00` ou `.toISOString()` em UTC), para não depender do fuso de quem abre;
   - colunas, nesta ordem: `id;data;tipo;quantidade;unidade;custo_unitario;saldo_depois;quem_lancou;motivo;turno;pedido;mesa;item_vendido;qtd_vendida`;
   - `tipo` em português (`entrada`, `ajuste`, `venda`); campos vazios ficam vazios (sem `null`).
6. **Segurança do CSV:** os campos de texto livre (`quem_lancou`, `motivo` e `item_vendido`) que começarem com `=`, `+`, `-`, `@`, tab, `\r` ou `\n` recebem um `'` na frente, para a planilha não executar fórmula. Campos com `;`, aspas ou quebra de linha vão entre aspas, com as aspas internas duplicadas. As colunas numéricas não passam pelo prefixo, porque são geradas pelo servidor.

## Modelo de dados

Sem migration. O filtro por período e por turno usa `stock_movements_ingredient_idx` (o volume por insumo é pequeno). Se a medição mostrar necessidade, um índice `(ingredient_id, created_at)` entra no PR do backend.

## Contrato da API

`GET /ingredients/3/movements?from=2026-11-23T00:00:00-03:00&to=2026-11-24T00:00:00-03:00&limit=2`

```json
{
  "ingredient": { "id": "3", "name": "Picanha", "unit": "kg", "stockQuantity": 4.85, "minStock": 2, "unitCost": 79.9, "active": true, "belowMin": false },
  "consistent": true,
  "summary": { "count": 3, "in": 5, "out": -0.45, "net": 4.55 },
  "movements": [
    { "id": "131", "type": "sale", "quantity": -0.3, "unitCost": 79.9, "balanceAfter": 4.85, "createdAt": "...", "by": "Garçom", "reason": null, "shiftId": "7",
      "sale": { "orderId": "42", "tableNumber": 5, "menuItem": "Picanha na chapa", "itemQuantity": 2 } },
    { "id": "127", "type": "sale", "quantity": -0.15, "unitCost": 79.9, "balanceAfter": 5.15, "createdAt": "...", "by": "Garçom", "reason": null, "shiftId": "7",
      "sale": { "orderId": "40", "tableNumber": 2, "menuItem": "Picanha na chapa", "itemQuantity": 1 } }
  ],
  "nextBefore": "127"
}
```

`GET /ingredients/3/movements.csv?shiftId=7`

```text
id;data;tipo;quantidade;unidade;custo_unitario;saldo_depois;quem_lancou;motivo;turno;pedido;mesa;item_vendido;qtd_vendida
127;2026-11-23T19:40:02-03:00;venda;-0,15;kg;79,9;5,15;Garçom;;7;40;2;Picanha na chapa;1
131;2026-11-23T19:42:10-03:00;venda;-0,3;kg;79,9;4,85;Garçom;;7;42;5;Picanha na chapa;2
```

## Telas

O modal "Histórico" (spec 016) ganha:
- **Período:** campos "De" e "Até" (`input type="date"`; o "Até" inclui o dia inteiro). O navegador converte o dia local em `from`/`to` com fuso.
- **"Só o turno atual":** um botão de 44 px com `aria-pressed`, que usa o id de `GET /shifts/active`. Fica desabilitado, com a dica "Nenhum turno aberto", quando não há turno aberto.
- **"Limpar filtros"**, visível quando algum filtro está ativo.
- **Resumo do recorte** acima da lista, quando `summary` vem preenchido: "3 movimentos · entradas +5 kg · saídas −0,45 kg · líquido +4,55 kg".
- **"Exportar CSV":** baixa o arquivo com os filtros atuais.
  - O download usa `fetch` com o token e um `Blob` (o link direto não enviaria o `Authorization`). O nome do arquivo vem do `Content-Disposition`.
  - O `services/api.js` ganha `api.download(path)`, que devolve `{ blob, filename }` no sucesso e lança o mesmo erro da API no `4xx`/`5xx`.
  - Enquanto baixa, o botão mostra "Exportando..." e fica desabilitado (em estado próprio, sem esconder ou travar o "Carregar mais" da lista). Um erro (por exemplo, o `422` de mais de 10.000 linhas) aparece no modal.
- Trocar qualquer filtro recarrega a lista do início, como o filtro por tipo já faz.
- No celular, os filtros quebram em linhas, e o botão "Exportar CSV" fica no fim do painel.

## Critérios de aceite

- [ ] **Período:** `from`/`to` filtram por `created_at` (`to` exclusivo) e combinam com `type` e a paginação, sem repetir nem pular movimentos.
- [ ] **Turno:** `shiftId` traz só os movimentos daquele turno; turno inexistente → lista vazia.
- [ ] **Saldo:** com filtro de período, `balanceAfter` do primeiro movimento é igual ao da mesma linha sem filtro.
- [ ] **Resumo:** `summary` soma o recorte inteiro, mesmo com `limit=1`, e é `null` sem filtro.
- [ ] **Validação:** data sem fuso, data inválida, `from >= to` e `shiftId` não numérico → `422`.
- [ ] **CSV:**
  - cabeçalho exato, BOM, `;`, vírgula decimal, `\r\n` e ordem do mais antigo para o mais recente;
  - `Content-Disposition` com o nome do insumo sem acento;
  - motivo `=1+1` sai como `'=1+1`, e motivo com `;` e aspas sai entre aspas;
  - acima de 10.000 linhas → `422` (no teste, com o limite injetado no service);
  - `401`, `403` (garçom, caixa e cozinha) e `404` no envelope JSON; `admin` → `200`.
- [ ] **Testes:**
  - integração no backend (filtros, resumo, CSV e erros);
  - Vitest (o período e o "Só o turno atual" mudam a query, o resumo aparece, "Exportar CSV" chama `api.download` com os filtros e mostra o erro);
  - Cypress (no cenário RN-15, "Só o turno atual" mostra a venda, e a exportação devolve um CSV com a linha da venda).
- [ ] **Documentação:**
  - `frontend/CONTRATO-API.md`;
  - `docs/ESPECIFICACAO.md` (RN-15 na matriz §4, com a menção ao período e ao CSV);
  - a spec 016 aponta para esta spec.

## Fora de escopo

- Exportar o histórico de todos os insumos de uma vez, ou em `.xlsx`/PDF.
- Lista de turnos antigos para escolher (não há rota de listagem de turnos). Para um turno passado, o gerente usa o período.
- Gráfico do saldo ao longo do tempo.
- Agendar ou enviar o CSV por e-mail.
