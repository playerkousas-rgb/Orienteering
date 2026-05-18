import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import * as XLSX from 'xlsx'
import { Html5Qrcode } from 'html5-qrcode'
import {
  Award,
  Camera,
  Check,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  KeyRound,
  Lock,
  MapPin,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react'
import './App.css'

type Team = { id: string; name: string; group: string }
type CheckpointPayload = { type: 'CP'; cp: string; score: number; salt: string; eventId: string; sig: string }
type IdentityPayload = { type: 'TEAM'; id: string; name: string; group: string; salt: string; eventId: string; sig: string }
type Punch = { cp: string; score: number; salt: string; sig: string; punchedAt: string }
type RaceState = { team: Team | null; punches: Punch[]; locked: boolean; settlementQr: string }
type ScoreRecord = {
  teamId: string
  teamName: string
  group: string
  total: number
  cpCount: number
  status: '有效' | '無效'
  reason: string
  startTime: string
  finishTime: string
  staffNote: string
  scannedAt: string
}

type AppSettings = { centerPassword: string; cpPassword: string; superPassword: string; eventCode: string }

const SUPER_PASSWORD_HASH = '1K4V4BU'
const DEFAULT_SETTINGS: AppSettings = { centerPassword: '', cpPassword: '', superPassword: '', eventCode: '' }
const STORAGE_KEY = 'scout-orienteering-player-state'
const SCORE_KEY = 'scout-orienteering-admin-scoreboard'
const SETTINGS_KEY = 'scout-orienteering-settings'
const initialRaceState: RaceState = { team: null, punches: [], locked: false, settlementQr: '' }

function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  const saved = raw ? safeParse<Partial<AppSettings>>(raw) : null
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function getEventSecret() {
  return `ORIENTEERING_BLUE_OFFLINE_V3|${getSettings().eventCode || 'UNCONFIGURED'}`
}

function getEventId() {
  return stableHash(`EVENT|${getSettings().eventCode || 'UNCONFIGURED'}`).slice(0, 8)
}

function verifySuperPassword(password: string) {
  return stableHash(password) === SUPER_PASSWORD_HASH
}

function isConfigured() {
  const settings = getSettings()
  return Boolean(settings.eventCode && settings.centerPassword && settings.cpPassword)
}

function stableHash(input: string) {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) hash = (hash * 33) ^ input.charCodeAt(i)
  return (hash >>> 0).toString(36).toUpperCase()
}

function makeSalt() {
  const bytes = new Uint32Array(2)
  window.crypto.getRandomValues(bytes)
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`.toUpperCase()
}

function signCheckpoint(cp: string, score: number, salt: string) {
  return stableHash(`CP|${cp}|${score}|${salt}|${getEventSecret()}`)
}

function signTeam(id: string, name: string, group: string, salt: string) {
  return stableHash(`TEAM|${id}|${name}|${group}|${salt}|${getEventSecret()}`)
}

function signSettlement(team: Team, punches: Punch[]) {
  const body = punches.map((p) => `${p.cp}:${p.score}:${p.salt}:${p.sig}`).sort().join('|')
  return stableHash(`SETTLE|${team.id}|${team.name}|${team.group}|${body}|${getEventSecret()}`)
}

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

async function qrDataUrl(payload: unknown, size = 520) {
  return QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
    color: { dark: '#061B3A', light: '#FFFFFF' },
  })
}

function verifyCheckpoint(payload: CheckpointPayload) {
  return payload.eventId === getEventId() && payload.sig === signCheckpoint(payload.cp, payload.score, payload.salt)
}

function verifyIdentity(payload: IdentityPayload) {
  return payload.eventId === getEventId() && payload.sig === signTeam(payload.id, payload.name, payload.group, payload.salt)
}

function useLocalState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    return raw ? safeParse<T>(raw) ?? fallback : fallback
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

function Pill({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-800 ring-blue-200',
    green: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    red: 'bg-rose-100 text-rose-800 ring-rose-200',
    amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  }
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${tones[tone]}`}>{children}</span>
}

function QrScanner({ title, helper, onResult, buttonClass = 'bg-blue-700' }: { title: string; helper: string; onResult: (text: string) => void; buttonClass?: string }) {
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState('')
  const regionId = useMemo(() => `qr-${Math.random().toString(36).slice(2)}`, [])
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    const scanner = new Html5Qrcode(regionId)
    scannerRef.current = scanner
    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (cancelled || cameras.length === 0) return
        const backCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[0]
        scanner.start(
          backCamera.id,
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            onResult(decodedText)
            setOpen(false)
          },
          () => undefined,
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      scannerRef.current?.stop().catch(() => undefined)
      scannerRef.current?.clear()
      scannerRef.current = null
    }
  }, [open, onResult, regionId])

  return (
    <div className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
      <button onClick={() => setOpen(true)} className={`flex w-full items-center justify-center gap-3 rounded-3xl px-6 py-6 text-xl font-black text-white shadow-lg transition hover:brightness-95 ${buttonClass}`}>
        <Camera size={30} /> {title}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">{helper}</p>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-black">掃描 QR Code</h3>
              <button onClick={() => setOpen(false)} className="rounded-full bg-slate-100 p-2"><X size={20} /></button>
            </div>
            <div id={regionId} className="overflow-hidden rounded-3xl bg-slate-100" />
            <p className="mt-3 text-xs text-slate-500">若相機不可用，可貼上 QR 文字作後備輸入。</p>
            <textarea value={manual} onChange={(event) => setManual(event.target.value)} className="mt-2 h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-blue-600" placeholder="後備：貼上 QR 內容" />
            <button onClick={() => { onResult(manual.trim()); setManual(''); setOpen(false) }} className="mt-2 w-full rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">讀取貼上內容</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerApp() {
  const [race, setRace] = useLocalState<RaceState>(STORAGE_KEY, initialRaceState)
  const [notice, setNotice] = useState<{ type: 'ok' | 'warn' | 'bad'; text: string } | null>(null)
  const [settlementImage, setSettlementImage] = useState('')
  const total = race.punches.reduce((sum, punch) => sum + punch.score, 0)

  useEffect(() => {
    if (race.settlementQr) qrDataUrl(JSON.parse(race.settlementQr), 620).then(setSettlementImage)
  }, [race.settlementQr])

  function show(type: 'ok' | 'warn' | 'bad', text: string) {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 2600)
  }

  function scanIdentity(raw: string) {
    if (race.locked) return show('bad', '已結算鎖定，請交給終點工作人員。')
    const payload = safeParse<IdentityPayload>(raw)
    if (!payload || payload.type !== 'TEAM' || !verifyIdentity(payload)) return show('bad', '身份 QR Code 無效。')
    setRace({ ...initialRaceState, team: { id: payload.id, name: payload.name, group: payload.group } })
    show('ok', `已載入 ${payload.name}，現在只會顯示 CP 掃描及終點結算功能。`)
  }

  function scanCheckpoint(raw: string) {
    if (!race.team) return show('warn', '請先掃描大會派發的賽員身份 QR Code。')
    if (race.locked) return show('bad', '已結算鎖定，不能再掃 CP。')
    const payload = safeParse<CheckpointPayload>(raw)
    if (!payload || payload.type !== 'CP' || !verifyCheckpoint(payload)) return show('bad', 'CP QR Code 無效或遭竄改。')
    if (race.punches.some((punch) => punch.cp === payload.cp)) return show('warn', `CP ${payload.cp} 已打卡，不重複計分。`)
    setRace({ ...race, punches: [...race.punches, { cp: payload.cp, score: payload.score, salt: payload.salt, sig: payload.sig, punchedAt: new Date().toISOString() }] })
    show('ok', `CP ${payload.cp} 成功 +${payload.score}`)
  }

  async function settle() {
    if (!race.team) return show('warn', '請先掃描身份 QR Code。')
    const payload = { type: 'SETTLEMENT', team: race.team, punches: race.punches, total, sig: signSettlement(race.team, race.punches), generatedAt: new Date().toISOString() }
    setRace({ ...race, locked: true, settlementQr: JSON.stringify(payload) })
    setSettlementImage(await qrDataUrl(payload, 620))
    show('ok', '已產生結算 QR Code，賽員端已鎖定。')
  }

  function resetRace() {
    if (window.confirm('只供工作人員測試使用：確定清除本機賽員資料？')) {
      setRace(initialRaceState)
      setSettlementImage('')
    }
  }

  return (
    <main className="min-h-screen bg-[#02133E] px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-white">
          <div className="mb-5 rounded-[2rem] border border-white/10 bg-white/10 p-3 backdrop-blur">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-blue-100">切換身份 / Role Switch</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <a className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-[#02133E] shadow" href="/">賽員端</a>
              <a className="rounded-2xl bg-white/15 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/15 hover:bg-white/25" href="/center">賽事中心</a>
              <a className="rounded-2xl bg-white/15 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/15 hover:bg-white/25" href="/admin">CP 管理員</a>
              <a className="rounded-2xl bg-white/15 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/15 hover:bg-white/25 sm:col-span-3" href="/super">系統設定</a>
            </div>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-100">Participant App</p>
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">賽員端</h1>
          <p className="mt-2 text-blue-50">起點掃身份 QR 後，只保留 CP 掃描、打卡紀錄與最後結算 QR。</p>
        </header>

        {notice && <div className={`mb-4 flex items-center gap-3 rounded-3xl p-4 font-bold shadow-lg ${notice.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : notice.type === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'}`}>{notice.type === 'ok' ? <Check /> : <ShieldCheck />} {notice.text}</div>}

        <section className="rounded-[2rem] bg-white p-5 shadow-2xl md:p-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Pill tone={race.locked ? 'red' : race.team ? 'green' : 'amber'}>{race.locked ? '已鎖定' : race.team ? '比賽中' : '等待起點身份 QR'}</Pill>
            <button onClick={resetRace} className="text-xs font-bold text-slate-400 underline">重設</button>
          </div>

          {!race.team && <QrScanner title="掃描身份 QR Code" helper="由大會／管理員端派發，只需在起點掃一次。" onResult={scanIdentity} />}

          {race.team && !race.locked && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-blue-50 p-5">
                <p className="text-sm font-bold text-blue-700">目前小隊</p>
                <h2 className="text-3xl font-black text-slate-950">{race.team.name}</h2>
                <p className="text-slate-600">{race.team.group} · {race.team.id}</p>
              </div>
              <QrScanner title="📷 掃描 CP QR Code" helper="同一 CP 重複掃描不會更新、不會重複計分。" onResult={scanCheckpoint} buttonClass="bg-slate-950" />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-3xl border border-blue-100 p-5"><p className="text-sm font-bold text-slate-500">已掃 CP</p><p className="text-4xl font-black text-blue-700">{race.punches.length}</p></div>
                <div className="rounded-3xl border border-blue-100 p-5"><p className="text-sm font-bold text-slate-500">暫計分</p><p className="text-4xl font-black text-blue-700">{total}</p></div>
              </div>
              <button onClick={settle} className="flex w-full items-center justify-center gap-3 rounded-3xl bg-blue-700 px-6 py-5 text-xl font-black text-white shadow-lg hover:bg-blue-800"><Flag /> 最後結算：產生交回大會 QR</button>
            </div>
          )}

          {race.locked && settlementImage && (
            <div className="rounded-[2rem] border-4 border-slate-950 bg-white p-4 text-center">
              <h2 className="text-2xl font-black">交回大會結算 QR Code</h2>
              <p className="mt-1 text-sm text-slate-500">請把此畫面交給管理員端掃描。掃描後不可再修改。</p>
              <img className="mx-auto my-3 w-full max-w-sm" src={settlementImage} alt="結算 QR Code" />
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[2rem] bg-white/95 p-6 shadow-xl">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><ClipboardList className="text-blue-700" /> CP 打卡紀錄</h2>
          <div className="space-y-2">
            {race.punches.length === 0 ? <p className="text-sm text-slate-500">尚無 CP 紀錄。</p> : race.punches.map((punch) => <div key={punch.cp} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><div><p className="font-black">CP {punch.cp}</p><p className="text-xs text-slate-500">驗證碼 {punch.salt.slice(0, 8)}</p></div><b className="text-blue-700">+{punch.score}</b></div>)}
          </div>
        </section>
      </div>
    </main>
  )
}

function AdminApp({ role }: { role: 'center' | 'cp' }) {
  const authKey = role === 'center' ? 'scout-center-authed' : 'scout-cp-admin-authed'
  const isCenter = role === 'center'
  const [settings, setSettings] = useLocalState<AppSettings>(SETTINGS_KEY, getSettings())
  const [authed, setAuthed] = useState(localStorage.getItem(authKey) === 'yes')
  const [password, setPassword] = useState('')
  const [lockPassword, setLockPassword] = useState('')
  const [settingsText, setSettingsText] = useState('')
  const [cpNo, setCpNo] = useState('A01')
  const [cpScore, setCpScore] = useState(10)
  const [cpList, setCpList] = useState<Array<CheckpointPayload & { image: string }>>([])
  const [teamId, setTeamId] = useState('T001')
  const [teamName, setTeamName] = useState('青松小隊')
  const [teamGroup, setTeamGroup] = useState('第一分站')
  const [teamList, setTeamList] = useState<Array<IdentityPayload & { image: string }>>([])
  const [scores, setScores] = useLocalState<ScoreRecord[]>(SCORE_KEY, [])
  const [adminNotice, setAdminNotice] = useState('')
  const [startTime, setStartTime] = useState('')
  const [finishTime, setFinishTime] = useState('')
  const [staffNote, setStaffNote] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const ranked = useMemo(() => [...scores].sort((a, b) => b.total - a.total || a.scannedAt.localeCompare(b.scannedAt)), [scores])

  function importLockedSettings(raw: string) {
    const payload = safeParse<{ type: string; settings: AppSettings; sig: string }>(raw)
    if (!payload || payload.type !== 'EVENT_SETTINGS' || !payload.settings) {
      setAdminNotice('設定包格式錯誤。')
      return
    }
    const expected = stableHash(`SETTINGS|${payload.settings.eventCode}|${payload.settings.centerPassword}|${payload.settings.cpPassword}|${lockPassword}`)
    if (payload.sig !== expected) {
      setAdminNotice('鎖網頁密碼錯誤，不能套用本次活動設定。')
      return
    }
    setSettings(payload.settings)
    saveSettings(payload.settings)
    localStorage.removeItem('scout-center-authed')
    localStorage.removeItem('scout-cp-admin-authed')
    setSettingsText('')
    setLockPassword('')
    setAdminNotice('已套用本次活動設定，請使用活動負責人提供的後台密碼登入。')
  }

  if (!isConfigured()) {
    return <SetupRequired settingsText={settingsText} setSettingsText={setSettingsText} lockPassword={lockPassword} setLockPassword={setLockPassword} onImport={importLockedSettings} notice={adminNotice} />
  }

  function login() {
    const expectedPassword = isCenter ? settings.centerPassword : settings.cpPassword
    if (password === expectedPassword) {
      localStorage.setItem(authKey, 'yes')
      setAuthed(true)
    } else setAdminNotice(`密碼錯誤。請向活動負責人查詢本次活動密碼。`)
  }

  async function generateCp() {
    const cp = cpNo.trim().toUpperCase()
    const salt = makeSalt()
    const payload: CheckpointPayload = { type: 'CP', cp, score: Number(cpScore), salt, eventId: getEventId(), sig: signCheckpoint(cp, Number(cpScore), salt) }
    const image = await qrDataUrl(payload, 420)
    setCpList((list) => [{ ...payload, image }, ...list])
  }

  async function generateTeam(identity?: Team) {
    const data = identity ?? { id: teamId.trim(), name: teamName.trim(), group: teamGroup.trim() }
    const salt = makeSalt()
    const payload: IdentityPayload = { type: 'TEAM', ...data, salt, eventId: getEventId(), sig: signTeam(data.id, data.name, data.group, salt) }
    const image = await qrDataUrl(payload, 420)
    setTeamList((list) => [{ ...payload, image }, ...list])
  }

  async function importCsv(file: File) {
    const rows = (await file.text()).split(/\r?\n/).map((row) => row.trim()).filter(Boolean)
    for (const row of rows) {
      const [id, name, group] = row.split(',').map((cell) => cell?.trim())
      if (id && name && group) await generateTeam({ id, name, group })
    }
    setAdminNotice(`已匯入並產生 ${rows.length} 張賽員身份 QR。`)
  }

  function scanSettlement(raw: string) {
    const payload = safeParse<{ type: string; team: Team; punches: Punch[]; total: number; sig: string }>(raw)
    if (!payload || payload.type !== 'SETTLEMENT' || !payload.team || !Array.isArray(payload.punches)) return setAdminNotice('結算 QR 格式錯誤。')
    const checkpointValid = payload.punches.every((p) => verifyCheckpoint({ type: 'CP', cp: p.cp, score: p.score, salt: p.salt, eventId: getEventId(), sig: p.sig }))
    const noDuplicate = new Set(payload.punches.map((p) => p.cp)).size === payload.punches.length
    const total = payload.punches.reduce((sum, p) => sum + Number(p.score), 0)
    const settlementValid = payload.sig === signSettlement(payload.team, payload.punches)
    const valid = checkpointValid && noDuplicate && total === payload.total && settlementValid
    const record: ScoreRecord = {
      teamId: payload.team.id,
      teamName: payload.team.name,
      group: payload.team.group,
      total: valid ? total : 0,
      cpCount: payload.punches.length,
      status: valid ? '有效' : '無效',
      reason: valid ? 'CP Salt / 簽章 / 結算簽章通過' : '資料驗證失敗，疑似竄改或重複點位',
      startTime: startTime || '未登記',
      finishTime: finishTime || '未登記',
      staffNote: staffNote || '',
      scannedAt: new Date().toLocaleString('zh-HK'),
    }
    setScores((list) => [record, ...list.filter((item) => item.teamId !== record.teamId)])
    setStartTime('')
    setFinishTime('')
    setStaffNote('')
    setAdminNotice(`${record.teamName} 已收 QR 並登記：${record.status}`)
  }

  function exportExcel() {
    const sheet = XLSX.utils.json_to_sheet(ranked.map((record, index) => ({
      名次: record.status === '有效' ? index + 1 : '-',
      小隊ID: record.teamId,
      小隊名稱: record.teamName,
      組別: record.group,
      總分: record.total,
      CP數: record.cpCount,
      出發時間: record.startTime,
      到達時間: record.finishTime,
      狀態: record.status,
      審查備註: record.reason,
      工作人員備註: record.staffNote,
      登記時間: record.scannedAt,
    })))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, '成績總表')
    XLSX.writeFile(book, '童軍野外定向成績總表.xlsx')
  }

  if (!authed) {
    return <main className="grid min-h-screen place-items-center bg-[#02133E] p-4"><div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"><div className="mb-5 grid grid-cols-2 gap-2 text-center text-xs font-black sm:grid-cols-4"><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/">賽員端</a><a className={`rounded-2xl px-3 py-2 ${isCenter ? 'bg-[#02133E] text-white' : 'bg-slate-100 text-slate-700'}`} href="/center">賽事中心</a><a className={`rounded-2xl px-3 py-2 ${!isCenter ? 'bg-[#02133E] text-white' : 'bg-slate-100 text-slate-700'}`} href="/admin">CP 管理員</a><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/super">系統設定</a></div><div className="mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-blue-100 text-[#02133E]"><KeyRound size={32} /></div><h1 className="text-3xl font-black">{isCenter ? '賽事中心' : 'CP 管理員'}</h1><p className="mt-2 text-slate-500">{isCenter ? '負責派發賽員身份 QR、終點收結算 QR、統計及匯出成績。' : '只負責製作及列印 CP QR Code，不接觸賽員資料及成績總表。'}</p><p className="mt-3 rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900">本次活動代碼：{settings.eventCode} · Event ID：{getEventId()}</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && login()} className="mt-4 w-full rounded-2xl border border-slate-200 p-4 outline-none focus:border-blue-600" placeholder="輸入本次活動密碼" /><button onClick={login} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#02133E] p-4 font-black text-white hover:brightness-125"><Lock size={18} /> 進入{isCenter ? '賽事中心' : 'CP 管理員'}</button>{adminNotice && <p className="mt-3 text-sm font-bold text-rose-600">{adminNotice}</p>}</div></main>
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="bg-[#02133E] px-4 py-6 text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-100">{isCenter ? 'Race Center' : 'CP Admin'}</p><h1 className="text-3xl font-black md:text-5xl">{isCenter ? '賽事中心' : 'CP 管理員'}</h1><p className="mt-2 text-blue-50">{isCenter ? '派發賽員 QR、終點收結算 QR、統計及匯出成績。' : '製作含 Salt 與簽章的 CP QR Code，供列印放置於各檢查點。'}</p></div><div className="grid grid-cols-2 gap-2 text-sm font-black sm:flex"><a href="/" className="rounded-2xl bg-white/15 px-4 py-2 text-center hover:bg-white/25">賽員端</a><a href="/center" className={`rounded-2xl px-4 py-2 text-center hover:bg-white/25 ${isCenter ? 'bg-white text-[#02133E]' : 'bg-white/15 text-white'}`}>賽事中心</a><a href="/admin" className={`rounded-2xl px-4 py-2 text-center hover:bg-white/25 ${!isCenter ? 'bg-white text-[#02133E]' : 'bg-white/15 text-white'}`}>CP 管理員</a><a href="/super" className="rounded-2xl bg-white/15 px-4 py-2 text-center hover:bg-white/25">系統設定</a></div></div></header>
      <div className="mx-auto grid max-w-7xl gap-5 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-2">
        {adminNotice && <div className="rounded-3xl bg-blue-50 p-4 font-bold text-blue-800 ring-1 ring-blue-100 lg:col-span-2">{adminNotice}</div>}

        {isCenter && <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="text-2xl font-black text-[#02133E]">賽事中心設定說明</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <InfoCard title="手機 / 平板版面" text="已採用 responsive grid：手機單欄、大按鈕；平板兩欄；桌面寬表格可橫向捲動。" />
            <InfoCard title="組別欄位" text="是，原本第一分站就是組別/組別名稱，可輸入幼童軍、童軍、公開組或第一分站。" />
            <InfoCard title="防作弊密碼" text="每次活動代碼會成為 QR 簽章密鑰；不同活動產生的 QR 不能互用。" />
            <InfoCard title="系統設定" text="可由上方切換進入；必須輸入超級管理員密碼才可更改賽事中心密碼、CP 管理員密碼及活動代碼。" />
          </div>
        </section>}

        {isCenter && <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><Users className="text-blue-700" /> 1. 派發賽員身份 QR</h2>
          <p className="mb-3 rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-900">「組別」即分組/組別名稱，例如第一分站、幼童軍組、童軍組、公開組。</p>
          <div className="grid gap-3 md:grid-cols-4"><input value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded-2xl border p-3" placeholder="小隊 ID" /><input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="rounded-2xl border p-3" placeholder="小隊名稱" /><input value={teamGroup} onChange={(event) => setTeamGroup(event.target.value)} className="rounded-2xl border p-3" placeholder="組別 / 分站" /><button onClick={() => generateTeam()} className="rounded-2xl bg-blue-700 p-3 font-black text-white"><QrCode className="inline" size={18} /> 生成</button></div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} className="mt-3 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 font-bold"><Upload size={18} /> 批次 CSV（id,name,group）</button>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-3">{teamList.map((team) => <QrCard key={team.sig} title={team.name} subtitle={`${team.group} · ${team.id}`} image={team.image} />)}</div>
        </section>}

        {!isCenter && <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><MapPin className="text-blue-700" /> 製作 CP QR</h2>
          <div className="grid gap-3 sm:grid-cols-3"><input value={cpNo} onChange={(event) => setCpNo(event.target.value)} className="rounded-2xl border p-3" placeholder="CP 編號" /><input type="number" value={cpScore} onChange={(event) => setCpScore(Number(event.target.value))} className="rounded-2xl border p-3" placeholder="分數" /><button onClick={generateCp} className="rounded-2xl bg-blue-700 p-3 font-black text-white"><QrCode className="inline" size={18} /> 生成</button></div>
          <p className="mt-3 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-900">不是只有 CP 編號和分數：每個 CP QR 都會加入隨機 Salt、活動 Event ID 及簽章。賽事中心收結算 QR 時會重新驗證，錯活動或被改動的 QR 會判無效。</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-3">{cpList.map((cp) => <QrCard key={cp.sig} title={`CP ${cp.cp}`} subtitle={`${cp.score} 分 · Salt ${cp.salt.slice(0, 8)}`} image={cp.image} />)}</div>
          <button onClick={() => window.print()} className="mt-4 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 font-bold"><Printer size={18} /> 列印 QR</button>
        </section>}

        {isCenter && <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-2xl font-black"><Trophy className="text-blue-700" /> 3. 終點收賽員結算 QR / 匯出成績</h2><div className="flex gap-2"><button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 font-black text-white"><FileSpreadsheet size={18} /> 匯出 Excel</button><button onClick={() => setScores([])} className="rounded-2xl border px-4 py-2 font-bold">清空</button></div></div>
          <div className="mb-5 grid gap-3 rounded-3xl bg-blue-50 p-5 ring-1 ring-blue-100 sm:grid-cols-3"><label className="text-sm font-bold text-slate-700">出發時間<input value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded-2xl border border-blue-100 bg-white p-3 font-normal" placeholder="例 09:15" /></label><label className="text-sm font-bold text-slate-700">到達時間<input value={finishTime} onChange={(event) => setFinishTime(event.target.value)} className="mt-1 w-full rounded-2xl border border-blue-100 bg-white p-3 font-normal" placeholder="例 11:03" /></label><label className="text-sm font-bold text-slate-700">備註<input value={staffNote} onChange={(event) => setStaffNote(event.target.value)} className="mt-1 w-full rounded-2xl border border-blue-100 bg-white p-3 font-normal" placeholder="逾時/犯規/補充" /></label></div>
          <QrScanner title="掃描賽員結算 QR" helper="管理員端只在終點收取賽員端產生的結算 QR，驗證後加入總表。" onResult={scanSettlement} buttonClass="bg-blue-700" />
          <div className="mt-5 overflow-x-auto rounded-3xl border"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">名次</th><th>小隊</th><th>組別</th><th>總分</th><th>CP</th><th>出發/到達</th><th>狀態</th><th>備註</th><th>登記時間</th></tr></thead><tbody>{ranked.map((record, index) => <tr key={record.teamId} className="border-t"><td className="p-4 font-black">{record.status === '有效' ? <span className="inline-flex items-center gap-1"><Award size={16} /> {index + 1}</span> : '-'}</td><td><b>{record.teamName}</b><br /><span className="text-xs text-slate-500">{record.teamId}</span></td><td>{record.group}</td><td className="text-xl font-black text-blue-700">{record.total}</td><td>{record.cpCount}</td><td className="text-xs"><b>{record.startTime}</b><br />{record.finishTime}</td><td><Pill tone={record.status === '有效' ? 'green' : 'red'}>{record.status}</Pill></td><td className="max-w-xs text-xs text-slate-500">{record.reason}{record.staffNote ? `；${record.staffNote}` : ''}</td><td className="text-xs">{record.scannedAt}</td></tr>)}</tbody></table></div>
        </section>}
      </div>
    </main>
  )
}

function QrCard({ title, subtitle, image }: { title: string; subtitle: string; image: string }) {
  return <article className="break-inside-avoid rounded-3xl border-2 border-slate-900 bg-white p-4 text-center"><h3 className="text-2xl font-black">{title}</h3><p className="text-sm text-slate-500">{subtitle}</p><img src={image} alt={title} className="mx-auto my-2 w-48" /></article>
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100"><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>
}

function SetupRequired({ settingsText, setSettingsText, lockPassword, setLockPassword, onImport, notice }: { settingsText: string; setSettingsText: (value: string) => void; lockPassword: string; setLockPassword: (value: string) => void; onImport: (raw: string) => void; notice: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#02133E] p-4"><div className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-2xl"><div className="mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-amber-100 text-amber-700"><Lock size={32} /></div><h1 className="text-3xl font-black">系統尚未設定</h1><p className="mt-3 leading-7 text-slate-600">正式使用前，請套用本次活動設定。活動負責人會提供「設定包」及「鎖網頁密碼」。只有兩者正確，這台裝置才可登入本次活動後台。</p><div className="mt-5 rounded-3xl bg-slate-50 p-4"><label className="text-sm font-black text-slate-700">貼上本次活動設定包<textarea value={settingsText} onChange={(event) => setSettingsText(event.target.value)} className="mt-2 h-28 w-full rounded-2xl border border-slate-200 p-3 text-xs font-normal" placeholder="貼上 EVENT_SETTINGS 設定包" /></label><label className="mt-3 block text-sm font-black text-slate-700">鎖網頁密碼<input type="password" value={lockPassword} onChange={(event) => setLockPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-normal" placeholder="由活動負責人提供" /></label><button onClick={() => onImport(settingsText.trim())} className="mt-3 w-full rounded-2xl bg-[#02133E] px-4 py-3 font-black text-white">套用活動設定</button></div>{notice && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{notice}</p>}<a href="/super" className="mt-5 block rounded-2xl border border-slate-200 px-4 py-3 text-center font-black text-slate-700">我是系統擁有人：前往系統設定</a><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black"><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/">賽員端</a><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/center">賽事中心</a><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/admin">CP 管理員</a></div></div></main>
}

function SuperAdminApp() {
  const [settings, setSettings] = useLocalState<AppSettings>(SETTINGS_KEY, getSettings())
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [lockPassword, setLockPassword] = useState('')
  const [settingsPackage, setSettingsPackage] = useState('')

  function createLockedSettingsPackage() {
    if (!settings.eventCode || !settings.centerPassword || !settings.cpPassword) {
      setNotice('請先儲存活動代碼、賽事中心密碼及 CP 管理員密碼。')
      return
    }
    if (!lockPassword.trim()) {
      setNotice('請輸入本次活動的鎖網頁密碼。')
      return
    }
    const payload = {
      type: 'EVENT_SETTINGS',
      settings,
      sig: stableHash(`SETTINGS|${settings.eventCode}|${settings.centerPassword}|${settings.cpPassword}|${lockPassword.trim()}`),
    }
    setSettingsPackage(JSON.stringify(payload))
    setNotice('已產生本次活動設定包。請把設定包及鎖網頁密碼分開交給活動負責人。')
  }

  if (!authed) {
    return <main className="grid min-h-screen place-items-center bg-[#02133E] p-4"><div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl"><div className="mb-5 grid grid-cols-2 gap-2 text-center text-xs font-black sm:grid-cols-4"><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/">賽員端</a><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/center">賽事中心</a><a className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700" href="/admin">CP 管理員</a><a className="rounded-2xl bg-[#02133E] px-3 py-2 text-white" href="/super">系統設定</a></div><div className="mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-slate-100 text-[#02133E]"><Lock size={32} /></div><h1 className="text-3xl font-black">系統設定</h1><p className="mt-2 text-slate-500">入口可見以免忘記；必須輸入超級管理員密碼才可進入。</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (verifySuperPassword(password) ? setAuthed(true) : setNotice('密碼錯誤'))} className="mt-6 w-full rounded-2xl border border-slate-200 p-4 outline-none focus:border-blue-600" placeholder="輸入超級管理員密碼" /><button onClick={() => verifySuperPassword(password) ? setAuthed(true) : setNotice('密碼錯誤')} className="mt-4 w-full rounded-2xl bg-[#02133E] p-4 font-black text-white">進入設定</button>{notice && <p className="mt-3 text-sm font-bold text-rose-600">{notice}</p>}</div></main>
  }

  return <main className="min-h-screen bg-[#02133E] p-4"><div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"><h1 className="text-3xl font-black">超級管理設定</h1><p className="mt-2 text-slate-500">你先設定每次活動的後台密碼及活動代碼，再產生「設定包」和「鎖網頁密碼」交給該次活動負責人。下一次活動只要更改鎖網頁密碼/活動代碼，舊工作人員即使記得舊密碼也不能套用新活動後台。</p><SettingsPanel settings={settings} setSettings={setSettings} onSaved={setNotice} /><section className="mt-5 rounded-3xl bg-slate-50 p-4"><h2 className="text-xl font-black">產生活動設定包</h2><p className="mt-2 text-sm leading-6 text-slate-600">設定包可給活動負責人匯入到賽事中心或 CP 管理員裝置。鎖網頁密碼請分開提供，避免設定包被其他人直接套用。</p><input type="password" value={lockPassword} onChange={(event) => setLockPassword(event.target.value)} className="mt-3 w-full rounded-2xl border border-slate-200 p-3" placeholder="輸入本次活動鎖網頁密碼" /><button onClick={createLockedSettingsPackage} className="mt-3 w-full rounded-2xl bg-[#02133E] px-4 py-3 font-black text-white">產生設定包</button>{settingsPackage && <textarea readOnly value={settingsPackage} className="mt-3 h-32 w-full rounded-2xl border border-slate-200 bg-white p-3 text-xs" />}</section>{notice && <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-900">{notice}</p>}</div></main>
}

function SettingsPanel({ settings, setSettings, onSaved }: { settings: AppSettings; setSettings: (settings: AppSettings) => void; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState(settings)

  function save() {
    const next = {
      centerPassword: draft.centerPassword.trim(),
      cpPassword: draft.cpPassword.trim(),
      superPassword: '',
      eventCode: draft.eventCode.trim(),
    }
    if (!next.centerPassword || !next.cpPassword || !next.eventCode) {
      onSaved('請填寫活動代碼、賽事中心密碼及 CP 管理員密碼。')
      return
    }
    setSettings(next)
    saveSettings(next)
    localStorage.removeItem('scout-center-authed')
    localStorage.removeItem('scout-cp-admin-authed')
    onSaved('設定已儲存。因活動代碼或密碼可能已更改，賽事中心及 CP 管理員需重新登入。')
  }

  return <div className="mt-3 space-y-3"><label className="block text-xs font-black text-slate-600">活動代碼 / 特定密碼<input value={draft.eventCode} onChange={(event) => setDraft({ ...draft, eventCode: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200 p-3 text-sm font-normal" placeholder="例 HK-SCOUT-2026-FINAL" /></label><label className="block text-xs font-black text-slate-600">賽事中心密碼<input value={draft.centerPassword} onChange={(event) => setDraft({ ...draft, centerPassword: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200 p-3 text-sm font-normal" /></label><label className="block text-xs font-black text-slate-600">CP 管理員密碼<input value={draft.cpPassword} onChange={(event) => setDraft({ ...draft, cpPassword: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-200 p-3 text-sm font-normal" /></label><button onClick={save} className="w-full rounded-2xl bg-[#02133E] px-4 py-3 text-sm font-black text-white">儲存新設定</button><p className="text-xs leading-5 text-slate-500">活動代碼會參與身份 QR、CP QR、結算 QR 的簽章。每次活動請更改活動代碼，舊活動 QR 將不能在新活動驗證通過。</p></div>
}

function App() {
  if (window.location.pathname.startsWith('/super')) return <SuperAdminApp />
  if (window.location.pathname.startsWith('/center')) return <AdminApp role="center" />
  if (window.location.pathname.startsWith('/admin')) return <AdminApp role="cp" />
  return <PlayerApp />
}

export default App
