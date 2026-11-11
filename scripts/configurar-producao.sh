#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
PROJETO="$(pwd)"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

passo() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

passo "Instalando Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 git cron openssl
  sudo systemctl enable --now docker
fi
sudo usermod -aG docker "$USER" || true
docker() { sudo docker "$@"; }

passo "Liberando portas 80 e 443 no firewall do servidor"
for porta in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$porta" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 5 -p tcp --dport "$porta" -j ACCEPT
  fi
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
else
  sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
fi
echo "Lembrete: libere também 80 e 443 na 'Security List' da Oracle (painel web)."

mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3000 ] && ! swapon --show | grep -q .; then
  passo "Pouca memória (${mem_mb} MB): criando 2 GB de swap"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f .env.production ]; then
  passo "Configurando o .env.production"
  read -rp "Domínio (ex.: replog.duckdns.org): " DOMINIO
  read -rp "Gmail que vai enviar os e-mails (ex.: voce@gmail.com): " GMAIL
  read -rsp "Senha de app do Gmail (16 letras, sem espaços): " SENHA_APP
  echo
  cat > .env.production <<EOF
REPLOG_DOMAIN=${DOMINIO}
POSTGRES_USER=replog
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=replog
REPLOG_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')
REPLOG_FRONTEND_URL=https://${DOMINIO}
REPLOG_CORS_ORIGINS=https://${DOMINIO}
REPLOG_COOKIE_SECURE=true
REPLOG_EMAIL_BACKEND=smtp
REPLOG_SMTP_HOST=smtp.gmail.com
REPLOG_SMTP_PORT=587
REPLOG_SMTP_STARTTLS=true
REPLOG_SMTP_USERNAME=${GMAIL}
REPLOG_SMTP_PASSWORD=${SENHA_APP// /}
REPLOG_EMAIL_FROM=REPLOG <${GMAIL}>
REPLOG_LOG_LEVEL=INFO
REPLOG_WORKERS=2
REPLOG_HTTP_PORT=8080
EOF
  chmod 600 .env.production
  echo ".env.production criado (somente você pode ler)."
else
  echo ".env.production já existe: mantido."
fi

passo "Construindo e subindo o REPLOG (a primeira vez demora alguns minutos)"
mkdir -p backups
sudo "${COMPOSE[@]}" --profile https up -d --build

passo "Aguardando a API responder"
for _ in $(seq 1 60); do
  if sudo "${COMPOSE[@]}" exec -T api python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')" >/dev/null 2>&1; then
    echo "API no ar."
    break
  fi
  sleep 3
done

passo "Agendando backup diário (03:00, mantém 14 dias)"
LINHA="0 3 * * * cd ${PROJETO} && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db sh -c 'pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc -f /backups/replog-\$(date +\\%Y\\%m\\%d).dump' && find ${PROJETO}/backups -name '*.dump' -mtime +14 -delete"
( sudo crontab -l 2>/dev/null | grep -v 'replog-' ; echo "$LINHA" ) | sudo crontab -

DOMINIO_FINAL=$(grep '^REPLOG_DOMAIN=' .env.production | cut -d= -f2)
passo "Pronto!"
echo "Abra: https://${DOMINIO_FINAL}  (o certificado HTTPS pode levar 1 a 2 minutos na primeira vez)"
echo "Para virar administrador depois de criar sua conta:"
echo "  sudo docker compose -f docker-compose.prod.yml --env-file .env.production exec api python -m app.cli promover SEU-EMAIL"
