# poc-bank-system

POC de um sistema bancário para estudo de system design. NestJS + TypeORM + Postgres, com notificação por email enviada por uma fila (BullMQ + Redis).

## Rodando

```bash
cp .env.example .env
docker compose up -d   # Postgres (porta 5433) + Redis (porta 6380) + Mailpit (SMTP fake)
npm install
npm run migration:run  # cria as tabelas
npm run seed           # apaga TODOS os dados e cria as contas de teste (pede confirmação)
npm run start:dev      # API em http://localhost:3000/api
npm run start:worker:dev   # em outro terminal: worker que envia os emails
```

O `npm run seed` limpa o banco e cria duas contas de teste:

| Conta | ID | Saldo inicial |
|---|---|---|
| Alice | `11111111-1111-4111-8111-111111111111` | R$ 1.000,00 |
| Bob | `22222222-2222-4222-8222-222222222222` | R$ 500,00 |

Os emails enviados aparecem em **http://localhost:8025** (Mailpit).

## Endpoints

Não há login: a conta "logada" é a que vem no header `x-account-id`. Valores sempre em **centavos** (`1050` = R$ 10,50).

### `POST /api/transfer`: faz uma transferência e notifica os dois lados por email

```bash
curl -X POST localhost:3000/api/transfer \
  -H 'x-account-id: 11111111-1111-4111-8111-111111111111' \
  -H 'content-type: application/json' \
  -d '{"toAccountId": "22222222-2222-4222-8222-222222222222", "amount": 15000}'
```

`201` com a transferência criada · `422` saldo insuficiente · `404` conta destino não existe · `400` body inválido

### `GET /api/transfer/:id`: consulta se uma transferência foi realizada

```bash
curl localhost:3000/api/transfer/<id> -H 'x-account-id: 11111111-1111-4111-8111-111111111111'
```

`200` se existe e você é o remetente ou o destinatário · `404` caso contrário

### `GET /api/health`: health check

```bash
curl localhost:3000/api/health
```

`200` com `{"status":"ok"}`, sem precisar do `x-account-id`. É a rota para o health check de load balancers (o do ALB não envia headers personalizados). Só diz que o processo está de pé e atendendo HTTP: não consulta o banco, para que uma queda do Postgres não tire todas as instâncias do balanceador de uma vez.

### `GET /api/balance`: saldo da conta

```bash
curl localhost:3000/api/balance -H 'x-account-id: 11111111-1111-4111-8111-111111111111'
```

## Decisões

- **Dinheiro em centavos (`bigint`):** evita erro de arredondamento de ponto flutuante.
- **Emails por fila, com outbox:** a transferência grava os dois emails na tabela `emails` com status `pending` na mesma transação, então só existe email de transferência que aconteceu. Depois do commit, cada email vira um job na fila `emails` (BullMQ/Redis) e a resposta HTTP não espera o envio. Um serviço separado, o worker (`src/main.worker.ts`), consome a fila, envia e marca `sent`. A API não envia email, então pico de envio ou SMTP lento não disputam CPU com as requisições, e API e worker escalam cada um no seu ritmo. Sem worker rodando, os emails só ficam `pending` esperando.
  - **Retry:** um envio que falha é tentado de novo até 5 vezes, com backoff exponencial (1s, 2s, 4s, 8s). Depois disso o email fica `failed`.
  - **Varredura:** se o processo morrer entre o commit e o enfileiramento, ou o Redis estiver fora do ar, o email fica `pending` sem job. A cada 1 min uma varredura (agendada uma vez só no Redis, mesmo com várias réplicas) enfileira os `pending` com mais de 30 s.
  - **Sem duplicata na fila:** o id do job é o id do email, então enfileirar o mesmo email duas vezes não cria dois jobs, e o worker ignora email que já não está `pending`. Ainda assim a entrega é *at-least-once*: se o processo morrer depois de enviar e antes de marcar `sent`, o email sai de novo.

## Migrations

Ficam em `src/database/migrations/`. Depois de alterar uma entidade:

```bash
npm run migration:generate -- src/database/migrations/NomeDaMudanca   # gera a migration comparando entidades x banco
npm run migration:run                                                  # aplica as pendentes
npm run migration:revert                                               # desfaz a última
```

Depois de gerar, registre a classe nova na lista `migrations` de `src/database/typeorm.options.ts`.

## Configuração

Via `.env` (ver `.env.example`) ou variáveis de ambiente, que têm prioridade. Todas são obrigatórias e validadas na subida (`src/config/env.validation.ts`): se faltar alguma ou o valor for inválido, a API não sobe e lista o problema.

## Testes

```bash
npm test                   # unitários
npm run test:integration   # integração: API inteira + Postgres real (precisa do Docker rodando)
```

Os de integração sobem um Postgres descartável com Testcontainers, aplicam as migrations e não tocam no banco de dev.

### Teste de carga (k6)

Só precisa do Docker rodando:

```bash
npm run test:load
env RATE=200 ACCOUNTS=1000 npm run test:load
env API_REPLICAS=1 npm run test:load
env WORKER_REPLICAS=2 npm run test:load
npm run test:load:warm                     # aquece 15 s antes de medir
env WARMUP_SECONDS=30 npm run test:load:warm
```

Sobe um ambiente descartável e separado do de dev (`load/docker-compose.yml`): Postgres, Redis, Mailpit, `API_REPLICAS` réplicas da API buildada pelo `Dockerfile` (padrão 3), um nginx na frente distribuindo as requisições entre elas (round-robin, `load/nginx.conf`) e `WORKER_REPLICAS` workers de email (padrão 1, mesma imagem rodando `dist/main.worker`), todos consumindo a mesma fila no Redis. Antes das réplicas subirem, um container `setup` roda as migrations e cria Alice, Bob e `ACCOUNTS` contas de carga (padrão 10000, com R$ 10.000 cada). Quando o nginx responde, o k6 dispara `RATE` transferências/s (padrão 1000) entre pares aleatórios durante 1 min. No fim tudo é derrubado, inclusive os volumes.

Cada réplica da API e cada worker abre até 33 conexões com o Postgres, por isso o `max_connections` dele sobe para 200 nesse ambiente (dá para até 6 processos no total). Para comparar escala horizontal, rode com `API_REPLICAS=1` e depois com `3`: o tráfego passa pelo nginx nos dois casos, então só o número de réplicas muda.

O `test:load` mede desde o primeiro segundo, com tudo frio: o Node ainda compilando o código, os pools de conexão vazios e o k6 criando VUs. É o que uma réplica nova sente num deploy ou num autoscaling. O `test:load:warm` antes sobe a taxa de 50/s até `RATE` ao longo de `WARMUP_SECONDS` (padrão 15) e só então começa a medir, então mostra o sistema em regime estável. As requisições do aquecimento não contam nas metas. Comparar os dois diz quanto da latência vem do início frio.

O resumo mostra p90, p95 e p99. Só falha por dois motivos: a API não sustentar `RATE` requisições/s (tolerância de 1%) ou o p99 passar de 300 ms. O p99 mede até o `202` do POST, não o processamento pelo worker. Para isso, 2 transferências/s são rastreadas até o `job.status` sair de `pending`: `transfer_completion_time` mostra quanto o dinheiro demora para chegar e `transfer_completion_timeouts` conta as que não terminaram em 110 s (só informativas, não reprovam).

## Deploy (AWS)

Cada push na `main` roda os testes, publica a imagem `nicollasprado/poc-bank-system:<sha curto>` no Docker Hub e faz o deploy nas EC2 pelo CodeDeploy, uma instância por vez (`deploy/appspec.yml`). Em cada instância, o `deploy/scripts/start.sh` baixa a imagem nova, roda as migrations e sobe a API (porta 3000) e o worker; o `validate.sh` só libera a instância de volta para o load balancer quando `/api/health` responde.

Como as instâncias são atualizadas uma de cada vez, a versão nova roda junto com a antiga por alguns instantes: migrations precisam ser compatíveis com a versão anterior (adicionar coluna é seguro; renomear ou apagar, não).

Configuração única:

- **Em cada EC2:** Docker e o agente do CodeDeploy instalados, uma instance role com `s3:GetObject` no bucket das revisões, e o arquivo `/etc/poc-bank/app.env` com as variáveis da API (`PORT=3000`, `DATABASE_URL`, `REDIS_URL`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`). Com RDS exigindo SSL, coloque o certificado da AWS em `/etc/poc-bank/global-bundle.pem` e use `sslrootcert=./global-bundle.pem` na `DATABASE_URL`.
- **No GitHub, secrets:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`.
- **No GitHub, variables:** `AWS_REGION`, `DEPLOY_BUCKET`, `CODEDEPLOY_APPLICATION` e `CODEDEPLOY_DEPLOYMENT_GROUP`.
- **Usuário IAM do deploy:** só com chave de acesso, sem console, e uma policy com `s3:PutObject` na pasta `poc-bank-system/` do bucket e `codedeploy:CreateDeployment`, `GetDeployment`, `GetDeploymentConfig`, `RegisterApplicationRevision` e `GetApplicationRevision` na aplicação e no deployment group.

## Postman

Importe `postman/poc-bank-system.postman_collection.json` no Postman (*Import*). URL base e IDs das contas já vêm como variáveis da coleção. Rode `npm run seed` antes e use o *Run collection* para executar tudo em ordem, com verificações em cada requisição.

