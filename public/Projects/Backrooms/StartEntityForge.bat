@echo off
cd /d "%~dp0"
echo === BACKROOMS ENTITY FORGE ===
if not exist "forge-server\node_modules\express" (
  echo Installing Express.js for Entity Forge server...
  pushd forge-server
  call npm install
  popd
)
start "" http://localhost:3460/entity-forge.html
node forge-server/server.js
pause
