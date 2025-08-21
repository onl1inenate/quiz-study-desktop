#!/bin/sh
set -e

if [ ! -f ../backend/.env ]; then
  echo ".env missing"
  exit 1
fi

E_VER=$(node -p "require('electron/package.json').version")

cd ../frontend
VITE_BASE=./ npm run build
cd - >/dev/null

npm --prefix ../backend run build
rm -rf resources
mkdir -p resources/frontend resources/backend
cp -R ../frontend/dist/* resources/frontend/
cp -R ../backend/dist/* resources/backend/
cp ../backend/.env resources/backend/.env

node build-backend-package.js

cd resources/backend
npm i --omit=dev
npx @electron/rebuild -f -m . --only better-sqlite3 -v "$E_VER"
