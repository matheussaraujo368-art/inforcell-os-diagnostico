@echo off
chcp 65001 >nul
title Inforcell OS - servidor local
cd /d "%~dp0"
echo ==================================================
echo   Inforcell OS - preparando e iniciando o sistema
echo ==================================================

where node >nul 2>nul
if errorlevel 1 goto semnode

if not exist "backend\.env" goto criarenv

cd /d "%~dp0backend"

echo.
echo [1/5] Instalando dependencias - a primeira vez demora alguns minutos...
call npm install
if errorlevel 1 goto erro

echo.
echo [2/5] Criando ou atualizando as tabelas do banco...
call npx prisma migrate deploy
if errorlevel 1 goto erro
call npx prisma generate
if errorlevel 1 goto erro

echo.
echo [3/5] Usuarios de teste...
call npm run db:seed
if errorlevel 1 goto erro

echo.
echo [4/5] Dados de demonstracao do agente - historico de celulares...
call npm run db:seed:demo
if errorlevel 1 goto erro

echo.
echo [5/5] Iniciando. Abra no navegador:  http://localhost:3333/app.html
echo Login: admin@inforcell.local  /  senha: inforcell123
echo Para parar o servidor, feche esta janela ou aperte Ctrl+C.
echo.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:3333/app.html"
call npm run dev
echo.
echo O servidor parou.
pause
exit /b 0

:semnode
echo.
echo [ERRO] Node.js nao encontrado.
echo Instale o Node.js 22 LTS em https://nodejs.org e abra este arquivo de novo.
pause
exit /b 1

:criarenv
copy "backend\.env.example" "backend\.env" >nul
echo.
echo [ATENCAO] Criei o arquivo backend\.env a partir do exemplo.
echo Confira a linha DATABASE_URL - usuario, senha e porta do seu MySQL.
echo Depois de salvar e fechar o Bloco de Notas, rode este arquivo de novo.
echo.
notepad "backend\.env"
pause
exit /b 0

:erro
echo.
echo [ERRO] Algo deu errado no passo acima. Leia a mensagem e confira o COMO-RODAR-NO-PC.md
echo Se o erro for de banco, confira se o MySQL do XAMPP esta ligado - botao Start.
pause
exit /b 1
