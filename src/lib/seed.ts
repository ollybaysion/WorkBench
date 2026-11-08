import type { Command, Runbook, EnvPreset } from '../types'
import { now } from './util'
import { seedBoardCommands } from './seedBoard'

const t = now()
const base = (id: string, tags: string[]) => ({ id, createdAt: t, updatedAt: t, tags })

// ===================== 서버 셋업 (server) =====================
// 전제: Ubuntu Server 22.04 / 24.04 LTS, 관리자 계정은 sudo 사용 가능

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
    description: 'Ubuntu 22.04/24.04 신규 서버를 운영 가능한 상태로 만드는 표준 절차입니다.',
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
            '필요 시 Docker · Docker Compose 설치',
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
        description: '아래 행을 서버 인벤토리 표에 추가합니다.',
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
      { id: 'i5', title: '사후 보고서 작성', description: '도구함의 장애 보고 템플릿으로 보고서를 만들어 AKG 에 올립니다.' },
    ],
  },
  ...serverRunbooks,
]
