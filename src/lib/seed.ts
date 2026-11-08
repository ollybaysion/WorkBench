import type { Note, Command, Runbook, Task, EnvPreset } from '../types'
import { now, todayStr } from './util'
import { seedBoardCommands } from './seedBoard'
import { cheatsheetNotes } from './cheatsheets'

const t = now()
const base = (id: string, tags: string[]) => ({ id, createdAt: t, updatedAt: t, tags })

// ===================== 서버 셋업 (server) =====================
// 전제: Ubuntu Server 22.04 / 24.04 LTS, 관리자 계정은 sudo 사용 가능

const serverNotes: Note[] = [
  {
    ...base('note_srv_init', ['server', 'linux', '보안']),
    title: '신규 Linux 서버 초기 설정 체크리스트',
    folder: '서버 셋업',
    content: `> 전제: **Ubuntu Server 22.04 / 24.04 LTS**. 클라우드 콘솔(또는 IPMI) 접근 수단을 확보한 상태에서 진행하세요.
> SSH 설정을 바꿀 때는 **기존 세션을 끊지 말고** 새 터미널로 접속 확인 후 닫습니다. 런북: [[신규 서버 초기 셋업]]

## 1. 패키지 업데이트 · 호스트명 · 시간대

~~~bash
sudo apt update && sudo apt -y full-upgrade
sudo hostnamectl set-hostname app01
sudo timedatectl set-timezone Asia/Seoul
timedatectl
~~~

/etc/hosts 의 127.0.1.1 줄도 새 호스트명으로 맞춰 둡니다.

## 2. 관리 사용자 생성 · sudo 권한

~~~bash
sudo adduser deploy
sudo usermod -aG sudo deploy
id deploy
~~~

## 3. SSH 키 등록 (로컬 PC에서 실행)

~~~bash
ssh-keygen -t ed25519 -C "you@example.com"   # 키가 없다면
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@SERVER_IP
ssh deploy@SERVER_IP                          # 비밀번호 없이 접속되는지 확인
~~~

## 4. SSH 하드닝 (비밀번호 로그인 비활성화 · root 차단 · 포트 변경)

sshd는 **처음 읽은 값**을 사용하고 sshd_config.d/*.conf 는 이름순으로 읽힙니다.
클라우드 이미지의 50-cloud-init.conf 보다 먼저 읽히도록 **00-** 접두어를 씁니다.

~~~bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'
Port 22022
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF

sudo sshd -t                                   # 문법 검사 (출력 없으면 정상)
sudo sshd -T | grep -Ei '^(port|permitrootlogin|passwordauthentication) '
~~~

방화벽에서 새 포트를 **먼저 연 뒤** 재시작합니다(5단계 참고).

~~~bash
# Ubuntu 24.04: ssh.socket(소켓 활성화) 사용 → 포트 변경 시 daemon-reload 필요
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket

# Ubuntu 22.04
sudo systemctl restart ssh
~~~

새 터미널에서 확인: ssh -p 22022 deploy@SERVER_IP

## 5. 방화벽

**Ubuntu (ufw)**

~~~bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH            # 기존 22번 (포트 변경 확인 후 삭제)
sudo ufw allow 22022/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
# 새 포트 접속 확인 후
sudo ufw delete allow OpenSSH
~~~

**RHEL/Rocky (firewalld + SELinux)**

~~~bash
sudo firewall-cmd --permanent --add-port=22022/tcp
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
sudo semanage port -a -t ssh_port_t -p tcp 22022   # SELinux에 SSH 포트 등록
~~~

## 6. fail2ban

~~~bash
sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled  = true
port     = 22022
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
~~~

## 7. 자동 보안 업데이트

~~~bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
sudo unattended-upgrade --dry-run --debug | tail -n 20
~~~

## 8. Swap (메모리 4GB 이하 서버 권장)

~~~bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
free -h
~~~

## 9. 시간 동기화 (NTP)

Ubuntu 기본은 systemd-timesyncd 입니다.

~~~bash
sudo timedatectl set-ntp true
timedatectl status          # "System clock synchronized: yes" 확인
timedatectl timesync-status
# chrony를 쓰려면: sudo apt install -y chrony && chronyc tracking
~~~

## 마무리 체크

- [ ] 새 포트 + 키로 접속 확인, 비밀번호/루트 로그인 거부 확인
- [ ] ufw status 에 필요한 포트만 열려 있음
- [ ] fail2ban sshd jail 활성
- [ ] [[서버 인벤토리 (호스트/역할/IP/담당자 표)]] 갱신
`,
  },
  {
    ...base('note_srv_docker', ['server', 'docker']),
    title: 'Docker & Docker Compose 설치',
    folder: '서버 셋업',
    content: `> 전제: **Ubuntu 22.04 / 24.04**, Docker 공식 apt 저장소 사용. (배포판의 docker.io 패키지와 섞지 마세요.)

## 1. 기존 패키지 제거

~~~bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y $pkg
done
~~~

## 2. 공식 저장소 등록

~~~bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \\
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \\
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
~~~

## 3. 설치 · 확인

~~~bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
~~~

## 4. sudo 없이 사용 (선택)

~~~bash
sudo usermod -aG docker $USER
newgrp docker        # 또는 로그아웃 후 재로그인
~~~

> docker 그룹은 사실상 root 권한입니다. 운영 서버에서는 배포 계정에만 부여하세요.

## 5. 로그 로테이션

~~~bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
~~~

## 주의: Docker와 ufw

Docker가 게시(-p)한 포트는 iptables 규칙으로 **ufw를 우회**합니다.
외부에 노출할 필요가 없는 포트는 127.0.0.1 에만 바인딩하고 Nginx로 프록시하세요.

~~~yaml
services:
  web:
    image: registry.local/web:1.0.0
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
~~~

배포 절차는 런북 [[서비스 배포 (Docker Compose)]] 를 참고하세요.
`,
  },
  {
    ...base('note_srv_nginx', ['server', 'nginx', 'tls']),
    title: "Nginx 리버스 프록시 + Let's Encrypt (certbot)",
    folder: '서버 셋업',
    content: `> 전제: **Ubuntu 22.04 / 24.04**, 도메인 A/AAAA 레코드가 서버 IP를 가리키고 80/443 포트가 열려 있음.
> 예시 도메인 app.example.com, 백엔드는 127.0.0.1:3000.

## 1. Nginx 설치

~~~bash
sudo apt update
sudo apt install -y nginx
sudo ufw allow 'Nginx Full'
systemctl status nginx --no-pager
~~~

## 2. WebSocket용 map (http 컨텍스트)

~~~bash
sudo tee /etc/nginx/conf.d/connection-upgrade.conf >/dev/null <<'EOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF
~~~

## 3. 사이트 설정

~~~nginx
# /etc/nginx/sites-available/app.example.com
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 60s;
    }
}
~~~

~~~bash
sudo ln -s /etc/nginx/sites-available/app.example.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
~~~

## 4. certbot으로 인증서 발급

권장: snap 패키지 (apt의 python3-certbot-nginx 도 가능)

~~~bash
sudo apt remove -y certbot           # apt 버전이 있다면
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

sudo certbot --nginx -d app.example.com -m ops@example.com --agree-tos --redirect
~~~

certbot이 443 server 블록과 HTTP→HTTPS 리다이렉트를 자동으로 추가합니다.

## 5. 갱신 확인

~~~bash
sudo certbot renew --dry-run
systemctl list-timers | grep -i certbot
sudo certbot certificates
~~~

## 트러블슈팅

| 증상 | 확인 |
|---|---|
| 502 Bad Gateway | 백엔드 기동 여부: curl -I http://127.0.0.1:3000 |
| certbot 챌린지 실패 | DNS 전파, 80 포트 개방, server_name 일치 |
| 413 Request Entity Too Large | client_max_body_size 상향 |
`,
  },
  {
    ...base('note_srv_systemd', ['server', 'systemd']),
    title: 'systemd 서비스 등록 템플릿',
    folder: '서버 셋업',
    content: `> 전제: **Ubuntu 22.04 / 24.04** (systemd 249+). 앱은 /opt/myapp, 실행 계정은 deploy.

## 1. 유닛 파일

~~~ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My App
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/myapp
EnvironmentFile=-/etc/myapp/myapp.env
ExecStart=/opt/myapp/bin/server --port 3000
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
LimitNOFILE=65535

# 하드닝
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
~~~

## 2. 등록 · 기동

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
systemctl status myapp --no-pager
journalctl -u myapp -f
~~~

## 3. 자주 쓰는 명령

~~~bash
sudo systemctl restart myapp
sudo systemctl edit myapp          # override.conf 로 일부만 덮어쓰기
systemctl cat myapp                # 최종 적용된 유닛 확인
systemd-analyze verify /etc/systemd/system/myapp.service
journalctl -u myapp --since "1 hour ago" --no-pager
~~~

## 4. 주기 작업은 cron 대신 timer

~~~ini
# /etc/systemd/system/myapp-backup.timer
[Unit]
Description=Daily backup for myapp

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
~~~

같은 이름의 myapp-backup.service(Type=oneshot)를 만든 뒤 sudo systemctl enable --now myapp-backup.timer 로 활성화하고 systemctl list-timers 로 확인합니다.
`,
  },
  {
    ...base('note_srv_inventory', ['server', '인벤토리']),
    title: '서버 인벤토리 (호스트/역할/IP/담당자 표)',
    folder: '서버 셋업',
    content: `> 서버를 추가·폐기할 때마다 이 표를 갱신하세요. 셋업 절차: [[신규 Linux 서버 초기 설정 체크리스트]]

| 호스트 | 환경 | 역할 | 사설 IP | OS | SSH 포트 | 담당자 | 비고 |
|---|---|---|---|---|---|---|---|
| dev-app01.example.internal | dev | 앱 (Docker Compose) | 10.10.1.11 | Ubuntu 24.04 | 22022 | 홍길동 | |
| stg-app01.example.internal | staging | 앱 (Docker Compose) | 10.20.1.11 | Ubuntu 24.04 | 22022 | 김철수 | |
| prod-app01.example.internal | production | 앱 #1 | 10.30.1.11 | Ubuntu 22.04 | 22022 | 이영희 | LB 뒤 |
| prod-app02.example.internal | production | 앱 #2 | 10.30.1.12 | Ubuntu 22.04 | 22022 | 이영희 | LB 뒤 |
| prod-db01.example.internal | production | PostgreSQL 16 | 10.30.2.21 | Ubuntu 22.04 | 22022 | 박DBA | 매일 03:00 백업 |
| ops-mon01.example.internal | 공통 | Grafana / Prometheus | 10.0.0.31 | Ubuntu 24.04 | 22022 | 홍길동 | |

## 확인용 명령

~~~bash
hostnamectl
ip -br addr
lsb_release -ds
uptime
~~~
`,
  },
]

const serverCommands: Command[] = [
  {
    ...base('cmd_srv_ssh_copy', ['server', 'ssh']),
    title: 'SSH 공개키 등록',
    description: '로컬 PC에서 실행. 서버의 ~/.ssh/authorized_keys 에 공개키를 추가합니다.',
    template: 'ssh-copy-id -i ~/.ssh/id_ed25519.pub -p {{ssh_port}} {{user}}@{{host}}',
    vars: [{ name: 'ssh_port', default: '22' }, { name: 'user', default: 'deploy' }, { name: 'host' }],
    risk: 'change',
    precheck: ['로컬에 키가 있는지 확인 (ls ~/.ssh/id_ed25519.pub, 없으면 ssh-keygen -t ed25519)', '아직 포트 변경 전이라면 ssh_port=22'],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_ssh', ['server', 'ssh']),
    title: 'SSH 접속',
    template: 'ssh -p {{ssh_port}} {{user}}@{{host}}',
    vars: [{ name: 'ssh_port', default: '22022' }, { name: 'user', default: 'deploy' }, { name: 'host' }],
    risk: 'read',
    precheck: [],
    favorite: true,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_sshd_check', ['server', 'ssh']),
    title: 'sshd 설정 검증',
    description: '문법 검사 후 실제 적용될 주요 값을 출력합니다.',
    template: "sudo sshd -t && sudo sshd -T | grep -Ei '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication) '",
    vars: [],
    risk: 'read',
    precheck: [],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_ufw_allow', ['server', 'firewall']),
    title: 'ufw 포트 허용',
    template: 'sudo ufw allow {{port}}/tcp && sudo ufw status numbered',
    vars: [{ name: 'port', default: '443' }],
    risk: 'change',
    precheck: ['정말 외부에 노출해야 하는 포트인지 확인', '가능하면 출발지 제한 검토 (sudo ufw allow from 10.0.0.0/8 to any port N proto tcp)'],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_ufw_status', ['server', 'firewall']),
    title: 'ufw 상태 확인',
    template: 'sudo ufw status verbose',
    vars: [],
    risk: 'read',
    precheck: [],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_svc_status', ['server', 'systemd']),
    title: '서비스 상태 확인',
    template: 'sudo systemctl status {{service}} --no-pager',
    vars: [{ name: 'service', default: 'nginx' }],
    risk: 'read',
    precheck: [],
    favorite: true,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_journal', ['server', 'systemd']),
    title: '서비스 로그 실시간 보기',
    template: 'journalctl -u {{service}} -f -n 200',
    vars: [{ name: 'service', default: 'nginx' }],
    risk: 'read',
    precheck: [],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_svc_restart', ['server', 'systemd']),
    title: '서비스 재시작',
    template: 'sudo systemctl restart {{service}} && sudo systemctl status {{service}} --no-pager',
    vars: [{ name: 'service', default: 'nginx' }],
    risk: 'change',
    precheck: ['설정 파일 검증 완료 (예: sudo nginx -t)', '재시작 중 짧은 다운타임 허용 여부 확인'],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_resources', ['server']),
    title: '디스크 · 메모리 사용량',
    template: 'df -h && free -h',
    vars: [],
    risk: 'read',
    precheck: [],
    favorite: true,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_certbot', ['server', 'nginx', 'tls']),
    title: "Let's Encrypt 인증서 발급 (nginx)",
    template: 'sudo certbot --nginx -d {{domain}} -m {{email}} --agree-tos --redirect',
    vars: [{ name: 'domain', default: 'app.example.com' }, { name: 'email', default: 'ops@example.com' }],
    risk: 'change',
    precheck: ['도메인 DNS가 이 서버 IP를 가리키는지 확인 (dig +short 도메인)', '80/443 포트 개방 확인', 'sudo nginx -t 통과'],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_compose_up', ['server', 'docker']),
    title: 'Compose 서비스 업데이트',
    template: 'cd {{app_dir}} && docker compose pull {{service}} && docker compose up -d --no-deps {{service}} && docker compose ps',
    vars: [{ name: 'app_dir', default: '/opt/app' }, { name: 'service', default: 'web' }],
    risk: 'change',
    precheck: ['롤백할 이전 이미지 태그 기록', '디스크 여유 공간 확인 (df -h)'],
    favorite: false,
    usageCount: 0,
  },
  {
    ...base('cmd_srv_docker_prune', ['server', 'docker']),
    title: 'Docker 미사용 리소스 정리 (볼륨 포함)',
    description: '중지된 컨테이너, 미사용 이미지·네트워크·볼륨을 모두 삭제합니다. 볼륨 데이터는 복구할 수 없습니다.',
    template: 'docker system prune -af --volumes',
    vars: [],
    risk: 'destroy',
    precheck: ['docker volume ls 로 삭제될 볼륨 중 필요한 데이터가 없는지 확인', '중지 상태로 남겨둔 컨테이너가 필요 없는지 확인', '백업 완료 여부 확인'],
    favorite: false,
    usageCount: 0,
  },
]

const serverRunbooks: Runbook[] = [
  {
    ...base('rb_srv_init', ['server', '셋업']),
    title: '신규 서버 초기 셋업',
    description: 'Ubuntu 22.04/24.04 신규 서버를 운영 가능한 상태로 만드는 표준 절차입니다. 상세 설명은 지식 베이스의 "신규 Linux 서버 초기 설정 체크리스트" 노트를 참고하세요.',
    inputs: [
      { name: 'host', default: 'prod-app02.example.internal' },
      { name: 'user', default: 'deploy' },
      { name: 'ssh_port', default: '22022' },
      { name: 'domain', default: 'app.example.com' },
    ],
    steps: [
      {
        id: 'si1',
        title: '패키지 업데이트 · 호스트명 · 시간대',
        description: '초기 계정(ubuntu/root)으로 접속해 실행합니다. host가 IP라면 hostname은 원하는 이름으로 바꿔 실행하세요.',
        tool: { type: 'command', template: 'sudo apt update && sudo apt -y full-upgrade && sudo hostnamectl set-hostname {{host}} && sudo timedatectl set-timezone Asia/Seoul' },
      },
      {
        id: 'si2',
        title: '관리 사용자 생성 · sudo 권한',
        tool: { type: 'command', template: 'sudo adduser {{user}} && sudo usermod -aG sudo {{user}} && id {{user}}' },
      },
      {
        id: 'si3',
        title: 'SSH 공개키 등록 (로컬 PC에서)',
        description: '아직 포트 변경 전이므로 기본 22번으로 접속합니다.',
        tool: { type: 'command', template: 'ssh-copy-id -i ~/.ssh/id_ed25519.pub {{user}}@{{host}}' },
      },
      {
        id: 'si4',
        title: '방화벽(ufw) 설정',
        description: '기존 22번(OpenSSH)은 새 포트 접속 확인 후 삭제합니다.',
        tool: {
          type: 'command',
          template:
            'sudo ufw default deny incoming && sudo ufw default allow outgoing \\\n  && sudo ufw allow OpenSSH && sudo ufw allow {{ssh_port}}/tcp \\\n  && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp \\\n  && sudo ufw --force enable && sudo ufw status verbose',
        },
      },
      {
        id: 'si5',
        title: 'SSH 하드닝 (키 전용 · root 차단 · 포트 {{ssh_port}})',
        description: '기존 세션을 유지한 채 실행하세요. 24.04는 ssh.socket, 22.04는 ssh 서비스를 재시작합니다.',
        tool: {
          type: 'command',
          template:
            "sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'\nPort {{ssh_port}}\nPermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nMaxAuthTries 3\nEOF\nsudo sshd -t && sudo systemctl daemon-reload \\\n  && { systemctl is-enabled --quiet ssh.socket && sudo systemctl restart ssh.socket; sudo systemctl restart ssh; }",
        },
      },
      {
        id: 'si6',
        title: '새 세션 접속 검증',
        tool: {
          type: 'checklist',
          items: [
            '새 터미널에서 ssh -p {{ssh_port}} {{user}}@{{host}} 접속 성공',
            'ssh -p {{ssh_port}} root@{{host}} 거부 확인',
            'ssh -o PubkeyAuthentication=no -p {{ssh_port}} {{user}}@{{host}} 비밀번호 로그인 거부 확인',
            'sudo ufw delete allow OpenSSH 실행 (22번 닫기)',
          ],
        },
      },
      {
        id: 'si7',
        title: 'fail2ban · 자동 보안 업데이트',
        tool: {
          type: 'command',
          template:
            "sudo apt install -y fail2ban unattended-upgrades \\\n  && printf '[sshd]\\nenabled = true\\nport = {{ssh_port}}\\nbackend = systemd\\nmaxretry = 5\\nbantime = 1h\\n' | sudo tee /etc/fail2ban/jail.local \\\n  && sudo systemctl enable --now fail2ban && sudo systemctl restart fail2ban \\\n  && sudo dpkg-reconfigure -plow unattended-upgrades \\\n  && sudo fail2ban-client status sshd",
        },
      },
      {
        id: 'si8',
        title: 'Swap · 시간 동기화 · Docker 확인',
        tool: {
          type: 'checklist',
          items: [
            'Swap 2G 구성 (free -h 로 확인)',
            'timedatectl 에서 System clock synchronized: yes',
            '필요 시 Docker 설치 — 지식 베이스 "Docker & Docker Compose 설치"',
          ],
        },
      },
      {
        id: 'si9',
        title: 'Nginx + TLS 인증서 ({{domain}})',
        description: 'DNS가 서버 IP를 가리키는지 먼저 확인하세요.',
        tool: { type: 'command', template: 'sudo apt install -y nginx && sudo nginx -t && sudo certbot --nginx -d {{domain}} --redirect' },
      },
      {
        id: 'si10',
        title: '인벤토리 갱신',
        description: '아래 행을 지식 베이스의 "서버 인벤토리" 노트 표에 추가합니다.',
        tool: { type: 'template', body: '| {{host}} | 환경 | 역할 | 사설 IP | Ubuntu 24.04 | {{ssh_port}} | {{who}} | {{domain}} |' },
      },
    ],
  },
  {
    ...base('rb_srv_deploy', ['server', '배포', 'docker']),
    title: '서비스 배포 (Docker Compose)',
    description: 'Docker Compose로 운영 중인 서비스를 무중단에 가깝게 업데이트하는 절차입니다.',
    inputs: [
      { name: 'host', default: 'prod-app01.example.internal' },
      { name: 'app_dir', default: '/opt/app' },
      { name: 'service', default: 'web' },
    ],
    steps: [
      { id: 'sd1', title: '배포 공지', tool: { type: 'template', body: '[배포] {{host}} · {{service}} 업데이트 시작 (담당: {{who}})\n영향: 수 초 내 재기동' } },
      { id: 'sd2', title: '서버 접속', tool: { type: 'command', template: 'ssh -p {{ssh_port}} {{user}}@{{host}}' } },
      {
        id: 'sd3',
        title: '사전 점검',
        tool: { type: 'checklist', items: ['디스크 여유 공간 확인 (df -h)', '현재 이미지 태그 기록 (롤백용)', '.env / compose 변경사항 반영 여부 확인'] },
      },
      { id: 'sd4', title: '현재 상태 기록', tool: { type: 'command', template: 'cd {{app_dir}} && docker compose ps && docker compose images {{service}}' } },
      { id: 'sd5', title: '새 이미지 pull', tool: { type: 'command', template: 'cd {{app_dir}} && docker compose pull {{service}}' } },
      { id: 'sd6', title: '서비스 재기동', tool: { type: 'command', template: 'cd {{app_dir}} && docker compose up -d --no-deps {{service}} && docker compose ps {{service}}' } },
      { id: 'sd7', title: '로그 확인', tool: { type: 'command', template: 'cd {{app_dir}} && docker compose logs -f --tail=100 {{service}}' } },
      { id: 'sd8', title: '안정화 대기', description: '5분간 에러 로그와 응답을 확인합니다.', tool: { type: 'timer', minutes: 5 } },
      { id: 'sd9', title: '오래된 이미지 정리', tool: { type: 'command', template: 'docker image prune -f' } },
      { id: 'sd10', title: '완료 공지', tool: { type: 'template', body: '[배포] {{host}} · {{service}} 업데이트 완료 ✅' } },
    ],
  },
]

export const seedEnvs: EnvPreset[] = [
  { id: 'env_dev', name: 'dev', vars: { ns: 'api-dev', app: 'api', db_host: 'db.dev.local', db_user: 'app', db: 'app_dev', registry: 'registry.local/api', host: 'dev-app01.example.internal', ssh_port: '22022', user: 'deploy' } },
  { id: 'env_stg', name: 'staging', vars: { ns: 'api-stg', app: 'api', db_host: 'db.stg.local', db_user: 'app', db: 'app_stg', registry: 'registry.local/api', host: 'stg-app01.example.internal', ssh_port: '22022', user: 'deploy' } },
  { id: 'env_prod', name: 'production', vars: { ns: 'api-prod', app: 'api', db_host: 'db.prod.local', db_user: 'app', db: 'app', registry: 'registry.local/api', host: 'prod-app01.example.internal', ssh_port: '22022', user: 'deploy' } },
]

export const seedNotes: Note[] = [
  {
    ...base('note_k8s', ['k8s', '운영']),
    title: 'Kubernetes 트러블슈팅 치트시트',
    folder: '운영',
    content: `## Pod가 CrashLoopBackOff일 때

먼저 **이전 컨테이너 로그**를 확인합니다. 관련 런북: [[API 서버 배포]]

\`\`\`bash
kubectl logs <pod> -n api-prod --previous
kubectl describe pod <pod> -n api-prod | grep -A5 Events
\`\`\`

## 리소스 부족 확인

\`\`\`bash
kubectl top pods -n api-prod --sort-by=memory
\`\`\`

OOMKilled이면 명령어 보관함의 **메모리 limit 상향** 명령을 환경에 맞춰 생성하세요.

| 상태 | 흔한 원인 | 첫 조치 |
|---|---|---|
| CrashLoopBackOff | 설정 오류, 의존 서비스 다운 | 이전 로그 확인 |
| ImagePullBackOff | 태그 오타, 레지스트리 인증 | 이미지 태그·시크릿 확인 |
| Pending | 리소스 부족, 노드 셀렉터 | describe → Events |
`,
  },
  {
    ...base('note_onboard', ['온보딩', '개발']),
    title: '신규 입사자 개발환경 세팅',
    folder: '개발',
    content: `# 개발환경 세팅

1. Git 설정 (\`user.name\`, \`user.email\`, SSH 키 등록)
2. Node LTS 설치 → \`corepack enable\`
3. 저장소 클론 후 \`npm install\`
4. VPN 접속 후 \`.env.local\` 작성 (팀 공유 드라이브의 샘플 참고)

## 자주 쓰는 명령

\`\`\`bash
npm run dev        # 로컬 서버
npm run lint       # 린트
npm run build      # 프로덕션 빌드
\`\`\`
`,
  },
  {
    ...base('note_branch', ['git', '개발']),
    title: 'Git 브랜치 전략',
    folder: '개발',
    content: `- \`main\`: 배포 가능한 상태만 유지
- \`feature/*\`: 기능 단위, PR로 main에 병합
- \`hotfix/*\`: 운영 긴급 수정, 태그 후 main·develop에 모두 반영

릴리스 태그는 \`vX.Y.Z\` 형식을 사용합니다. 태그 생성은 명령어 보관함의 **릴리스 태그 생성**을 사용하세요.
`,
  },
  {
    ...base('note_incident', ['장애', '결제']),
    title: '2026-10 장애 보고: 결제 API 지연',
    folder: '장애 보고',
    content: `# 장애 보고: 결제 API (SEV-2)

- **영향 시간**: 14:02 ~ 14:31 (29분)
- **영향 범위**: 결제 요청의 약 12% 타임아웃
- **원인(Root cause)**: 외부 PG 게이트웨이 응답 지연 + 재시도 폭주
- **조치**: 재시도 횟수 3 → 1로 축소, 타임아웃 30s → 10s
- **재발 방지**: 서킷 브레이커 도입, 알람 임계치 조정

## 타임라인
- 14:02 알람 수신
- 14:10 원인 식별
- 14:31 복구 확인
`,
  },
  ...serverNotes,
  ...cheatsheetNotes,
]

export const seedCommands: Command[] = [
  {
    ...base('cmd_pods', ['k8s']),
    title: 'Pod 목록 조회',
    template: 'kubectl get pods -n {{ns}}',
    vars: [{ name: 'ns', default: 'api-prod' }],
    risk: 'read',
    precheck: [],
    favorite: true,
    usageCount: 41,
  },
  {
    ...base('cmd_restart', ['k8s']),
    title: '디플로이먼트 재시작',
    template: 'kubectl rollout restart deploy/{{app}} -n {{ns}}',
    vars: [{ name: 'app', default: 'api' }, { name: 'ns', default: 'api-prod' }],
    risk: 'change',
    precheck: ['현재 롤아웃이 진행 중이 아닌지 확인', '트래픽이 적은 시간대인지 확인'],
    favorite: true,
    usageCount: 12,
  },
  {
    ...base('cmd_k8s_mem', ['k8s']),
    title: '메모리 limit 상향',
    description: 'OOMKilled 발생 시 limit/request를 함께 상향합니다.',
    template:
      'kubectl set resources deploy/{{app}} \\\n  --limits=memory={{mem}},cpu={{cpu}} \\\n  --requests=memory={{mem}},cpu={{cpu}} \\\n  -n {{ns}}',
    vars: [
      { name: 'app', default: 'api' },
      { name: 'ns', default: 'api-prod' },
      { name: 'mem', default: '2Gi' },
      { name: 'cpu', default: '1000m' },
    ],
    risk: 'change',
    precheck: ['현재 limit 값 확인 (kubectl get deploy -o yaml)', '노드 가용 메모리가 충분한지 확인'],
    favorite: false,
    usageCount: 23,
  },
  {
    ...base('cmd_delpod', ['k8s']),
    title: 'Pod 강제 삭제',
    template: 'kubectl delete pod {{pod}} -n {{ns}} --grace-period=0 --force',
    vars: [{ name: 'pod' }, { name: 'ns', default: 'api-prod' }],
    risk: 'destroy',
    precheck: ['해당 Pod가 Deployment/StatefulSet 관리 하에 있어 재생성되는지 확인', '데이터 유실 가능성 검토'],
    favorite: false,
    usageCount: 3,
  },
  {
    ...base('cmd_pgdump', ['db']),
    title: 'DB 덤프',
    template: 'pg_dump -h {{db_host}} -U {{db_user}} -Fc {{db}} > {{db}}_$(date +%Y%m%d).dump',
    vars: [{ name: 'db_host' }, { name: 'db_user', default: 'app' }, { name: 'db' }],
    risk: 'read',
    precheck: ['디스크 여유 공간 확인'],
    favorite: true,
    usageCount: 8,
  },
  {
    ...base('cmd_git_tag', ['git']),
    title: '릴리스 태그 생성',
    template: 'git tag -a v{{version}} -m "release {{version}}" && git push origin v{{version}}',
    vars: [{ name: 'version', description: '예: 2.14.0' }],
    risk: 'change',
    precheck: ['CHANGELOG 갱신 여부 확인'],
    favorite: false,
    usageCount: 19,
  },
  ...serverCommands,
  ...seedBoardCommands,
]

export const seedRunbooks: Runbook[] = [
  {
    ...base('rb_api_deploy', ['배포', 'k8s']),
    title: 'API 서버 배포',
    description: '릴리스 태그 생성부터 롤아웃, 안정화 확인까지의 표준 배포 절차입니다.',
    inputs: [
      { name: 'version', default: '2.14.0' },
      { name: 'env', default: 'production', options: ['staging', 'production'] },
      { name: 'who', default: '' },
    ],
    steps: [
      {
        id: 's1',
        title: '배포 공지 발송',
        description: '슬랙 #deploy 채널에 공지합니다.',
        tool: { type: 'template', body: '[{{env}}] API v{{version}} 배포 시작 (담당: {{who}})\n예상 소요: 15분 · 영향: 없음(롤링 업데이트)' },
      },
      {
        id: 's2',
        title: '태그 생성 및 푸시',
        description: '릴리스 태그를 만들고 원격에 푸시합니다.',
        tool: { type: 'command', template: 'git tag -a v{{version}} -m "release {{version}}" && git push origin v{{version}}' },
      },
      {
        id: 's3',
        title: '배포 전 체크리스트',
        tool: { type: 'checklist', items: ['DB 마이그레이션 필요 여부 확인', '롤백 이미지 태그 기록', 'CI 빌드 성공 확인'] },
      },
      {
        id: 's4',
        title: '이미지 롤아웃',
        description: '새 이미지로 교체 후 롤아웃 상태를 지켜봅니다.',
        tool: { type: 'command', template: 'kubectl set image deploy/api api={{registry}}:{{version}} -n {{ns}} && kubectl rollout status deploy/api -n {{ns}}' },
      },
      {
        id: 's5',
        title: '안정화 대기',
        description: '10분간 에러율·지연을 모니터링합니다.',
        tool: { type: 'timer', minutes: 10, link: 'https://grafana.example.com/d/api' },
      },
      {
        id: 's6',
        title: '완료 공지',
        tool: { type: 'template', body: '[{{env}}] API v{{version}} 배포 완료 ✅' },
      },
    ],
  },
  {
    ...base('rb_incident', ['장애']),
    title: '장애 초동 대응',
    description: '알람 수신 후 30분 내 수행할 초동 대응 절차입니다.',
    inputs: [{ name: 'service', default: '' }, { name: 'sev', default: 'SEV-2', options: ['SEV-1', 'SEV-2', 'SEV-3'] }],
    steps: [
      { id: 'i1', title: '장애 채널 공지', tool: { type: 'template', body: '[{{sev}}] {{service}} 장애 감지. 초동 대응 시작합니다. 담당: {{who}}' } },
      { id: 'i2', title: '영향 범위 파악', tool: { type: 'checklist', items: ['에러율 대시보드 확인', '영향 받는 사용자 비율 추정', '최근 배포 여부 확인'] } },
      { id: 'i3', title: '최근 배포 롤백 검토', tool: { type: 'command', template: 'kubectl rollout undo deploy/{{app}} -n {{ns}}' } },
      { id: 'i4', title: '모니터링 열기', tool: { type: 'link', url: 'https://grafana.example.com', label: 'Grafana' } },
      { id: 'i5', title: '사후 보고서 작성', description: '도구함의 장애 보고 템플릿을 사용해 지식 베이스에 저장합니다.' },
    ],
  },
  ...serverRunbooks,
]

export const seedTasks: Task[] = [
  { ...base('task_1', ['문서']), title: '로그 보존 정책 문서 업데이트', status: 'todo', repeat: 'none', due: todayStr(), noteId: 'note_k8s' },
  { ...base('task_2', ['운영']), title: '주간 DB 백업 검증', status: 'todo', repeat: 'weekly', due: todayStr() },
  { ...base('task_3', ['보안']), title: '스테이징 인증서 갱신', status: 'todo', repeat: 'none' },
  { ...base('task_4', ['배포']), title: 'API 서버 배포 v2.14.0', status: 'doing', repeat: 'none', runbookId: 'rb_api_deploy' },
  { ...base('task_5', ['장애']), title: '결제 API 장애 사후 분석', status: 'doing', repeat: 'none', noteId: 'note_incident' },
  { ...base('task_6', ['온보딩']), title: '신규 입사자 온보딩 가이드 작성', status: 'done', repeat: 'none', doneAt: t, noteId: 'note_onboard' },
  { ...base('task_7', ['server']), title: '신규 서버 셋업: prod-app02', status: 'todo', repeat: 'none', due: todayStr(), runbookId: 'rb_srv_init' },
]
