@echo off
title Extrator CNPJ - Servidor PC
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
)

if not exist "dist" (
  echo Compilando aplicacao para PC...
  call npm run build
)

set NODE_ENV=production
echo Iniciando Extrator CNPJ em http://localhost:3000 ...
start "" http://localhost:3000
node server.ts
pause
