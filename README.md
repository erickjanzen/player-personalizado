# Mini Player

Widget para Windows que mostra a mídia atual e permite controlar a reprodução.

## Executável portátil

Abra `dist/Mini-Player-1.0.0-portable.exe`. Não é necessário instalar Node.js
ou Electron para usar o executável. O aplicativo fica na bandeja do Windows;
clique no ícone para mostrar o player ou use o menu para abrir as configurações
e sair.

## Desenvolvimento e build

Com Node.js e npm instalados, execute:

```powershell
npm ci
npm start
```

Para gerar novamente o executável para Windows x64:

```powershell
npm run dist
```

O resultado fica em `dist/`. Os scripts PowerShell de integração com a mídia
do Windows são incluídos automaticamente no pacote. Os artefatos gerados não
são versionados no Git. O executável não possui assinatura digital.
