# Backup e restauração do banco de PRODUÇÃO (PostgreSQL no Docker).
param([string]$Restaurar)

$ErrorActionPreference = 'Stop'
$compose = @('compose', '-f', 'docker-compose.prod.yml', '--env-file', '.env.production')
New-Item -ItemType Directory -Force backups | Out-Null

if ($Restaurar) {
    $nome = Split-Path $Restaurar -Leaf
    Write-Host "Restaurando $nome — os dados atuais serão substituídos."
    docker @compose exec -T db sh -c "pg_restore -U `$POSTGRES_USER -d `$POSTGRES_DB --clean --if-exists /backups/$nome"
    Write-Host 'Restauração concluída.'
} else {
    $arquivo = "replog-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
    docker @compose exec -T db sh -c "pg_dump -U `$POSTGRES_USER -d `$POSTGRES_DB -Fc -f /backups/$arquivo"
    Write-Host "Backup criado: backups\$arquivo"
}
