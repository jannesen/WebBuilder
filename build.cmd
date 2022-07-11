@ echo off
setlocal

cd %~dp0

if exist "%~dp0..\..\node_modules\TypeScript" set NODE_PATH="%~dp0..\..\node_modules"
if exist "%~dp0..\node_modules\TypeScript"    set NODE_PATH="%~dp0..\node_modules"
if exist "%~dp0node_modules\TypeScript"       set NODE_PATH="%~dp0node_modules"

echo tsc: WebBuilder
"node.exe" "%NODE_PATH%\TypeScript\lib\tsc.js" --pretty false --incremental -p src\tsconfig.json
if errorlevel 1 goto done

if exist "%~dp0..\..\node_modules\eslint"     set NODE_PATH="%~dp0..\..\node_modules"
if exist "%~dp0..\node_modules\eslint"        set NODE_PATH="%~dp0..\node_modules"
if exist "%~dp0node_modules\eslint"           set NODE_PATH="%~dp0node_modules"

echo eslint: WebBuilder
"node.exe" "%NODE_PATH%\eslint\bin\eslint.js" --format unix --config src/.eslintrc.json src/**/*.ts

:done
