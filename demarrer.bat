@echo off
title Inventa GestyPro
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Telechargez Node.js 18+ sur https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm install
)

echo Demarrage de Inventa GestyPro sur http://localhost:3000 ...
echo Compte proprietaire (monitoring de toutes les entreprises) :
echo    franck06.nganou02oumbe2004@gmail.com / Aspirine46@!
echo Entreprise de demonstration : admin@shoppingplus.cm / Admin@2026
echo Une autre entreprise ? Bouton "Creer mon entreprise" sur l'ecran d'accueil.
call npm start
pause
