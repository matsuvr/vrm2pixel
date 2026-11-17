@echo off
node "%~dp0cli\index.mjs" %*
exit /b %errorlevel%
