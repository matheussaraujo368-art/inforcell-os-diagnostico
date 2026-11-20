# Como rodar o Inforcell OS no seu PC

Esta é a versão completa, com o agente de IA, a tela de Configurações e os dados de demonstração. Telas e API rodam juntas em `http://localhost:3333`.

## 1. O que instalar (uma vez)

1. **Node.js 22 LTS**: https://nodejs.org (baixe o instalador "LTS" e avance com as opções padrão).
2. **Um banco MySQL.** Escolha **uma** das opções:
   - **A) Você já tem MySQL do XAMPP, do Laragon ou do SISOS:** pode usar o mesmo servidor. Crie um banco **novo** chamado `inforcell_os`, por exemplo pelo phpMyAdmin. **Não use o banco do SISOS.**
   - **B) MySQL Installer:** https://dev.mysql.com/downloads/installer/ (instale "MySQL Server 8", anote a senha do root e crie o banco `inforcell_os`).
   - **C) Docker Desktop:** na pasta do projeto, rode `docker compose up -d`. O banco já é criado na porta **3307**, com usuário `root` e senha `inforcell`.

> O XAMPP traz MariaDB no lugar do MySQL. Na maioria dos casos funciona. Se a migração der erro, use a opção B ou C.

## 2. Configurar a conexão com o banco

1. Entre na pasta `backend`, copie `.env.example` e renomeie a cópia para `.env`. O `iniciar-windows.bat` faz isso sozinho na primeira vez.
2. Abra o `.env` no Bloco de Notas e ajuste a linha `DATABASE_URL`:

| Seu banco | DATABASE_URL |
|---|---|
| XAMPP/Laragon (root sem senha) | `mysql://root@localhost:3306/inforcell_os` |
| MySQL Installer | `mysql://root:SUA_SENHA@localhost:3306/inforcell_os` |
| Docker (opção C) | `mysql://root:inforcell@localhost:3307/inforcell_os` |

Não precisa colocar a chave da IA no `.env`: ela é cadastrada pela tela (passo 4).

## 3. Iniciar

**Windows:** dê dois cliques em **`iniciar-windows.bat`**, na pasta principal. Ele faz tudo sozinho:
- instala as dependências;
- cria as tabelas;
- cadastra os usuários de teste;
- cria os dados de demonstração;
- abre o navegador em http://localhost:3333/app.html.

**Pelo terminal (qualquer sistema):**
```bash
cd backend
npm install
npx prisma migrate deploy
npm run db:seed        # usuários de teste
npm run db:seed:demo   # histórico de celulares para o agente
npm run dev            # abra http://localhost:3333/app.html
```

Para iniciar de novo outro dia, basta rodar o `iniciar-windows.bat` outra vez (ou `npm run dev`). Os passos de seed não duplicam dados.

## 4. Usar

| Usuário | Senha | Para quê |
|---|---|---|
| `admin@inforcell.local` | `inforcell123` | Configurações (chave da IA), equipe e tudo mais |
| `tecnico@inforcell.local` | `inforcell123` | Diagnóstico com o agente |
| `atendente@inforcell.local` | `inforcell123` | Clientes e abertura de OS |

1. Entre como **admin** → **Configurações** → cole a chave da Anthropic (console.anthropic.com → API Keys) → **Salvar e testar**. A conta precisa ter créditos (Billing).
2. Saia e entre como **técnico** → **Ordens de Serviço**. Os dados de demonstração deixam duas OS abertas, prontas para usar:
   - **iPhone 11, "Não liga depois que caiu no chão"**: o agente deve encontrar os casos de flex do Power e sugerir um orçamento perto de R$ 170–180.
   - **Galaxy A12, "Parou de carregar"**: o agente deve encontrar o caso da subplaca de carga.
3. Na OS, clique em **Iniciar com o agente de IA**. Depois informe resultados e medições, anexe uma foto se quiser e conclua.

## 5. Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `Can't reach database server` | O MySQL não está ligado ou a `DATABASE_URL` está errada (porta, senha ou nome do banco). |
| `Unknown database 'inforcell_os'` | Crie o banco `inforcell_os` no phpMyAdmin ou no MySQL. |
| `EADDRINUSE :3333` | O servidor já está aberto em outra janela. Feche-a ou mude `PORT` no `.env`. |
| "A chave de IA foi recusada" | A chave foi copiada errada ou está revogada. Gere outra no console da Anthropic. |
| "A conta da Anthropic está sem créditos" | Adicione créditos em console.anthropic.com → Billing. |
| O agente demora | É normal levar de 10 a 40 segundos: ele faz consultas antes de responder. |

## 6. Testes automáticos (opcional)

```bash
cd backend
npm test            # sem banco
npm run test:api    # com banco: use um banco SÓ de testes, porque os testes criam dados
```
