@echo off
chcp 65001 >nul
title Inforcell OS - servidor local
echo ==================================================
echo   Inforcell OS - preparando e iniciando o sistema
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale o Node.js 22 LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

cd /d "%~dp0backend"

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo [ATENCAO] Criei o arquivo backend\.env a partir do exemplo.
  echo Abra backend\.env no Bloco de Notas, confira a linha DATABASE_URL
  echo (usuario, senha e porta do seu MySQL) e rode este arquivo de novo.
  echo.
  notepad .env
  pause
  exit /b 0
)

echo.
echo [1/5] Instalando dependencias (a primeira vez demora alguns minutos)...
call npm install || goto erro

echo.
echo [2/5] Criando ou atualizando as tabelas do banco...
call npx prisma migrate deploy || goto erro

echo.
echo [3/5] Usuarios de teste...
call npm run db:seed || goto erro

echo.
echo [4/5] Dados de demonstracao do agente (historico de celulares)...
call npm run db:seed:demo || goto erro

echo.
echo [5/5] Iniciando. Abra no navegador:  http://localhost:3333/app.html
echo Login: admin@inforcell.local  /  senha: inforcell123
echo Para parar o servidor, feche esta janela ou aperte Ctrl+C.
echo.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:3333/app.html"
call npm run dev
goto fim

:erro
echo.
echo [ERRO] Algo deu errado no passo acima. Leia a mensagem e confira o COMO-RODAR-NO-PC.md
pause
exit /b 1

:fim
