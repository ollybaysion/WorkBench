import { useStore } from '../store'
import { download, now, todayStr } from '../lib/util'

/** 전체 데이터를 JSON으로 내려받고 마지막 백업 시각을 기록 */
export async function exportBackup(): Promise<void> {
  const st = useStore.getState()
  const at = now()
  await st.setSettings({ lastBackupAt: at })
  const bundle = { ...useStore.getState().exportBundle(), exportedAt: at }
  download(`workbench-backup-${todayStr()}.json`, JSON.stringify(bundle, null, 2))
  st.showToast('JSON 백업 파일을 내려받았습니다')
}
