@ echo off
setlocal

set NODEJS=%~dp0..\..\OpenSoftware\NodeJS\
set NODE_PATH=%NODEJS%node_modules
set BUILDJS=%~dp0

"%NODEJS%node.exe" buildjsfile.js %*
