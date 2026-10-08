#!/usr/bin/env bash
# READ-ONLY health check of the VPS before adding apps. Changes nothing.
# Run:  bash vps-check.sh     (paste the output back to Claude / the team)

line() { printf '\n==== %s ====\n' "$1"; }

line "System";        (lsb_release -ds 2>/dev/null || head -1 /etc/os-release); uname -r; nproc | sed 's/^/CPUs: /'
line "Memory";        free -h
line "Disk";          df -h / | tail -1
line "Docker";        (docker --version && sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}') 2>/dev/null || echo "Docker not installed"
line "PM2";           (pm2 ls 2>/dev/null) || echo "PM2 not in use (for this user)"
line "Listening ports"; sudo ss -ltnp | awk 'NR==1 || /LISTEN/' | sed 's/users:((/  /; s/))//'
line "Web server";    (nginx -v 2>&1; sudo nginx -t 2>&1 | tail -1) || echo "Nginx not installed"
line "Nginx sites";   ls -la /etc/nginx/sites-enabled 2>/dev/null; ls /etc/nginx/conf.d 2>/dev/null
line "Domains served"; sudo grep -rhoE 'server_name[^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sort -u
line "Certificates";  sudo certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || echo "certbot not installed / no certs"
line "Firewall";      sudo ufw status 2>/dev/null | head -15 || echo "ufw not installed"
line "Done";          echo "Nothing was changed."
