#!/usr/bin/env bash
# Démarrage de Inventa GestyPro
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js n'est pas installé. Installez Node.js 18+ depuis https://nodejs.org puis relancez ce script."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Première utilisation : installation des dépendances…"
  npm install
fi

echo "🚀 Démarrage de Inventa GestyPro (http://localhost:${PORT:-3000})…"
echo "   Compte propriétaire (monitoring de toutes les entreprises) :"
echo "     franck06.nganou02oumbe2004@gmail.com / Aspirine46@!"
echo "   Entreprise de démonstration : admin@shoppingplus.cm / Admin@2026"
echo "   Une autre entreprise ? Bouton « Créer mon entreprise » sur l'écran d'accueil."
exec npm start
