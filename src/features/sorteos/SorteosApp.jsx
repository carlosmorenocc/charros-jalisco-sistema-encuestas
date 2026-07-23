import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import logo from '../../assets/logo.png'
import styles from './SorteosApp.module.css'
import { parseParticipantCsv } from './lib/parseParticipants'
import { secureRandomIndex } from './lib/secureRandom'
import {
  createDrawRecord,
  exportWinnerHistoryCsv,
  hashRoster
} from './lib/audit'

const SPIN_DURATION_MS = 7000
const REDUCED_SPIN_DURATION_MS = 900
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

const formatNumber = (value) => Number(value || 0).toLocaleString('es-MX')
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function createDemoParticipants(total = 500) {
  return Array.from({ length: total }, (_, index) => ({
    id: `DEMO-${String(index + 1).padStart(4, '0')}`,
    name: `Aficionado Charro ${String(index + 1).padStart(4, '0')}`,
    ticket: `B-${String(10001 + index)}`,
    email: `aficionado${String(index + 1).padStart(4, '0')}@demo.charros.invalid`,
    rowNumber: index + 2
  }))
}

function downloadText(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return reduced
}

function playTone(enabled, frequency, duration = 0.12, volume = 0.035) {
  if (!enabled) return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, context.currentTime)
  gain.gain.setValueAtTime(volume, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + duration)
  oscillator.addEventListener('ended', () => context.close())
}

function Metric({ label, value, accent = false }) {
  return (
    <div className={`${styles.metric} ${accent ? styles.metricAccent : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {Array.from({ length: 30 }, (_, index) => (
        <span
          key={index}
          style={{
            '--confetti-index': index,
            '--confetti-x': `${(index * 37) % 100}%`,
            '--confetti-delay': `${(index % 8) * 0.08}s`
          }}
        />
      ))}
    </div>
  )
}

export default function SorteosApp() {
  const pageRef = useRef(null)
  const fileInputRef = useRef(null)
  const winnerTitleRef = useRef(null)
  const spinLockRef = useRef(false)
  const tickerTimerRef = useRef(null)
  const reducedMotion = useReducedMotion()

  const [participants, setParticipants] = useState([])
  const [excludedIds, setExcludedIds] = useState(() => new Set())
  const [history, setHistory] = useState([])
  const [fileDetails, setFileDetails] = useState(null)
  const [rosterHash, setRosterHash] = useState('')
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('empty')
  const [prize, setPrize] = useState('Premio especial Charros')
  const [countdown, setCountdown] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [spinDuration, setSpinDuration] = useState(SPIN_DURATION_MS)
  const [tickerIndex, setTickerIndex] = useState(0)
  const [winner, setWinner] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [presentationMode, setPresentationMode] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [liveMessage, setLiveMessage] = useState('Carga una base para comenzar.')

  const eligibleParticipants = useMemo(
    () => participants.filter((participant) => !excludedIds.has(participant.id)),
    [participants, excludedIds]
  )

  const isBusy = status === 'loading' || status === 'countdown' || status === 'spinning'
  const displayName = status === 'spinning' && eligibleParticipants.length
    ? eligibleParticipants[tickerIndex % eligibleParticipants.length]?.name
    : winner?.name || (participants.length ? 'BASE VERIFICADA' : 'ESPERANDO BASE')

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Sorteos Oficiales | Charros de Jalisco'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (winner && winnerTitleRef.current) winnerTitleRef.current.focus()
  }, [winner])

  useEffect(() => {
    const handleFullscreen = () => {
      if (!document.fullscreenElement) setPresentationMode(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreen)
    return () => document.removeEventListener('fullscreenchange', handleFullscreen)
  }, [])

  useEffect(() => () => {
    if (tickerTimerRef.current) clearInterval(tickerTimerRef.current)
  }, [])

  function resetSession() {
    if (isBusy) return
    setParticipants([])
    setExcludedIds(new Set())
    setHistory([])
    setFileDetails(null)
    setRosterHash('')
    setWarnings([])
    setError('')
    setStatus('empty')
    setWinner(null)
    setTickerIndex(0)
    setLiveMessage('Carga una base para comenzar.')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetParticipants() {
    if (isBusy || participants.length === 0) return
    setExcludedIds(new Set())
    setHistory([])
    setWinner(null)
    setCountdown(null)
    setTickerIndex(0)
    setError('')
    setStatus('ready')
    setLiveMessage(
      `${formatNumber(participants.length)} participantes restablecidos y nuevamente elegibles.`
    )
  }

  async function applyParticipants(nextParticipants, details, nextWarnings = []) {
    const nextHash = await hashRoster(nextParticipants)
    setParticipants(nextParticipants)
    setExcludedIds(new Set())
    setHistory([])
    setFileDetails(details)
    setRosterHash(nextHash)
    setWarnings(nextWarnings)
    setError('')
    setWinner(null)
    setStatus('ready')
    setTickerIndex(0)
    setLiveMessage(`${formatNumber(nextParticipants.length)} participantes verificados.`)
  }

  async function processFile(file) {
    if (!file || isBusy) return
    setError('')
    setWarnings([])
    setStatus('loading')
    setLiveMessage('Validando el archivo CSV.')

    try {
      if (!file.name.toLocaleLowerCase('es-MX').endsWith('.csv')) {
        throw new Error('Selecciona un archivo con extensión .csv.')
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('El archivo supera el máximo permitido de 2 MB.')
      }

      const text = await file.text()
      const result = parseParticipantCsv(text)
      await applyParticipants(
        result.participants,
        {
          name: file.name,
          size: file.size,
          stats: result.stats,
          demo: false
        },
        result.warnings
      )
    } catch (fileError) {
      setParticipants([])
      setFileDetails(null)
      setRosterHash('')
      setStatus('empty')
      setError(fileError?.message || 'No fue posible leer el archivo.')
      setLiveMessage('El archivo no pudo validarse.')
    }
  }

  async function loadDemo() {
    if (isBusy) return
    setStatus('loading')
    setError('')
    setLiveMessage('Preparando una base demostrativa.')
    try {
      const demoParticipants = createDemoParticipants()
      await applyParticipants(
        demoParticipants,
        {
          name: 'demostracion-charros.csv',
          size: 0,
          demo: true,
          stats: {
            inputRows: demoParticipants.length,
            validParticipants: demoParticipants.length,
            duplicateRows: 0,
            emptyRows: 0,
            rejectedRows: 0
          }
        },
        ['Modo demostración: todos los nombres e identificadores son ficticios.']
      )
    } catch (demoError) {
      setStatus('empty')
      setError(demoError?.message || 'No fue posible iniciar la demostración.')
    }
  }

  function downloadSample() {
    const sample = [
      'id_participante,nombre,correo,id_boleto',
      'P-0001,Aficionado Charro Uno,aficionado1@example.com,B-10001',
      'P-0002,"Aficionado Charro, Dos",aficionado2@example.com,B-10002',
      'P-0003,Aficionado Charro Tres,aficionado3@example.com,B-10003'
    ].join('\r\n')
    downloadText(`\uFEFF${sample}\r\n`, 'plantilla-participantes-charros.csv', 'text/csv;charset=utf-8')
  }

  function exportHistory() {
    if (!history.length) return
    const date = new Date().toISOString().slice(0, 10)
    downloadText(
      exportWinnerHistoryCsv(history),
      `ganadores-charros-${date}.csv`,
      'text/csv;charset=utf-8'
    )
  }

  function exportAuditJson() {
    if (!history.length) return
    const date = new Date().toISOString().slice(0, 10)
    downloadText(
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        rosterHash,
        rules: {
          opportunity: 'one-per-person',
          repeatWinners: false,
          selection: 'web-crypto-rejection-sampling'
        },
        draws: history
      }, null, 2),
      `auditoria-sorteos-charros-${date}.json`,
      'application/json;charset=utf-8'
    )
  }

  async function togglePresentation() {
    if (presentationMode) {
      setPresentationMode(false)
      if (document.fullscreenElement) {
        await document.exitFullscreen?.().catch(() => undefined)
      }
      return
    }

    setPresentationMode(true)
    await pageRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  async function runDraw() {
    if (spinLockRef.current || isBusy || eligibleParticipants.length === 0) return
    spinLockRef.current = true
    setError('')
    setWinner(null)

    try {
      const winningIndex = secureRandomIndex(eligibleParticipants.length)
      const selectedWinner = eligibleParticipants[winningIndex]
      const duration = reducedMotion ? REDUCED_SPIN_DURATION_MS : SPIN_DURATION_MS
      setSpinDuration(duration)
      setStatus('countdown')
      setLiveMessage('El sorteo está por comenzar.')

      for (let value = 3; value >= 1; value -= 1) {
        setCountdown(value)
        playTone(soundEnabled, 380 + (3 - value) * 90, 0.1)
        await wait(reducedMotion ? 180 : 650)
      }

      setCountdown(null)
      setStatus('spinning')
      setLiveMessage('La ruleta está girando.')
      setTickerIndex(winningIndex)
      playTone(soundEnabled, 220, 0.22)

      tickerTimerRef.current = window.setInterval(() => {
        setTickerIndex((current) => (
          eligibleParticipants.length
            ? (current + 17) % eligibleParticipants.length
            : 0
        ))
      }, reducedMotion ? 180 : 72)

      await wait(50)
      const turns = 10 + (winningIndex % 5)
      const targetOffset = (winningIndex * 137.508) % 360
      setRotation((current) => current + turns * 360 + (360 - targetOffset))
      await wait(duration)

      if (tickerTimerRef.current) {
        clearInterval(tickerTimerRef.current)
        tickerTimerRef.current = null
      }

      const record = createDrawRecord({
        winner: selectedWinner,
        rosterHash,
        participantCount: eligibleParticipants.length,
        prize,
        drawNumber: history.length + 1
      })

      setTickerIndex(winningIndex)
      setHistory((current) => [...current, record])
      setExcludedIds((current) => {
        const next = new Set(current)
        next.add(selectedWinner.id)
        return next
      })
      setWinner(selectedWinner)
      setStatus('winner')
      setLiveMessage(
        `Ganador: ${selectedWinner.name}. Correo: ${selectedWinner.email || 'no disponible'}.`
      )
      playTone(soundEnabled, 660, 0.22, 0.055)
      window.setTimeout(() => playTone(soundEnabled, 880, 0.35, 0.05), 180)
    } catch (drawError) {
      setStatus(participants.length ? 'ready' : 'empty')
      setError(drawError?.message || 'No fue posible completar el sorteo.')
      setLiveMessage('El sorteo no pudo completarse.')
    } finally {
      spinLockRef.current = false
    }
  }

  function continueDrawing() {
    setWinner(null)
    setStatus(eligibleParticipants.length ? 'ready' : 'finished')
    setLiveMessage(
      eligibleParticipants.length
        ? `${formatNumber(eligibleParticipants.length)} participantes continúan elegibles.`
        : 'Todos los participantes disponibles ya ganaron.'
    )
  }

  const wheelButtonLabel = isBusy
    ? 'Sorteo en curso'
    : eligibleParticipants.length
      ? 'Iniciar sorteo'
      : 'Carga una base'

  return (
    <div
      ref={pageRef}
      className={`${styles.page} ${presentationMode ? styles.presentation : ''}`}
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src={logo} alt="Charros de Jalisco" />
          <div>
            <span>Sistema oficial</span>
            <h1>Sorteos Charros</h1>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerButton}
            onClick={() => setSoundEnabled((current) => !current)}
            aria-pressed={soundEnabled}
          >
            <span aria-hidden="true">{soundEnabled ? '🔊' : '🔇'}</span>
            {soundEnabled ? 'Sonido activo' : 'Sin sonido'}
          </button>
          <button
            type="button"
            className={styles.headerButton}
            onClick={togglePresentation}
            aria-pressed={presentationMode}
          >
            <span aria-hidden="true">{presentationMode ? '↙' : '⛶'}</span>
            {presentationMode ? 'Salir de presentación' : 'Modo presentación'}
          </button>
        </div>
      </header>

      <main className={styles.layout}>
        <aside className={styles.controlPanel} aria-label="Panel de operación">
          <section className={styles.panelSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.stepNumber}>01</span>
              <div>
                <p>Base participante</p>
                <h2>Carga y validación</h2>
              </div>
            </div>

            <input
              ref={fileInputRef}
              className={styles.visuallyHidden}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => processFile(event.target.files?.[0])}
              disabled={isBusy}
            />

            <button
              type="button"
              className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragActive(false)
                processFile(event.dataTransfer.files?.[0])
              }}
              disabled={isBusy}
            >
              <span className={styles.uploadIcon} aria-hidden="true">↑</span>
              <strong>
                {status === 'loading' ? 'Validando archivo…' : 'Seleccionar o arrastrar CSV'}
              </strong>
              <small>Máximo 3,000 personas · 2 MB</small>
            </button>

            <div className={styles.secondaryActions}>
              <button type="button" onClick={downloadSample}>Descargar plantilla</button>
              <button type="button" onClick={loadDemo} disabled={isBusy}>Probar demo</button>
            </div>

            {error && (
              <div className={styles.errorMessage} role="alert">
                <strong>No pudimos cargar la base</strong>
                <span>{error}</span>
              </div>
            )}

            {fileDetails && (
              <div className={styles.fileCard}>
                <div>
                  <span className={styles.fileCheck} aria-hidden="true">✓</span>
                  <div>
                    <strong>{fileDetails.name}</strong>
                    <small>
                      {fileDetails.demo
                        ? 'Datos ficticios para demostración'
                        : `${formatNumber(fileDetails.stats.inputRows)} filas revisadas`}
                    </small>
                  </div>
                </div>
                <button type="button" onClick={resetSession} disabled={isBusy}>
                  Cambiar
                </button>
              </div>
            )}

            {warnings.length > 0 && (
              <ul className={styles.warningList}>
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}

            {participants.length > 0 && (
              <div className={styles.preview}>
                <div className={styles.previewHeader}>
                  <strong>Vista previa</strong>
                  <span>Solo nombre en pantalla</span>
                </div>
                {participants.slice(0, 4).map((participant) => (
                  <div key={participant.id} className={styles.previewRow}>
                    <span>{participant.name}</span>
                    <small>Fila {participant.rowNumber}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panelSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.stepNumber}>02</span>
              <div>
                <p>Configuración</p>
                <h2>Premio y sorteo</h2>
              </div>
            </div>

            <label className={styles.field}>
              <span>Nombre del premio</span>
              <input
                value={prize}
                onChange={(event) => setPrize(event.target.value)}
                maxLength={80}
                disabled={isBusy}
              />
            </label>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={runDraw}
              disabled={isBusy || eligibleParticipants.length === 0}
            >
              <span aria-hidden="true">★</span>
              {isBusy ? 'Sorteo en curso…' : 'Iniciar sorteo'}
            </button>

            {participants.length > 0 && (
              <button
                type="button"
                className={styles.resetButton}
                onClick={resetParticipants}
                disabled={isBusy || (excludedIds.size === 0 && history.length === 0)}
              >
                <span aria-hidden="true">↻</span>
                Restablecer participantes
              </button>
            )}

            <p className={styles.ruleNote}>
              Una oportunidad por persona. Cada ganador se retira automáticamente.
              {participants.length > 0 && (
                <span> Restablecer conserva el CSV y devuelve el conteo completo.</span>
              )}
            </p>
          </section>

          {history.length > 0 && (
            <section className={styles.panelSection}>
              <div className={styles.historyHeading}>
                <div>
                  <p>Sesión actual</p>
                  <h2>Ganadores</h2>
                </div>
                <span>{history.length}</span>
              </div>

              <ol className={styles.historyList}>
                {history.map((record) => (
                  <li key={`${record.drawNumber}-${record.drawnAt}`}>
                    <span>{record.drawNumber}</span>
                    <div>
                      <strong>{record.winner.name}</strong>
                      <small>{record.prize}</small>
                    </div>
                  </li>
                ))}
              </ol>

              <div className={styles.exportActions}>
                <button type="button" onClick={exportHistory}>Exportar ganadores</button>
                <button type="button" onClick={exportAuditJson}>Exportar auditoría</button>
              </div>
            </section>
          )}
        </aside>

        <section className={styles.stage} aria-label="Escenario del sorteo">
          <div className={styles.stageLights} aria-hidden="true">
            <span />
            <span />
          </div>

          <div className={styles.scoreboard}>
            <Metric
              label="Participantes verificados"
              value={formatNumber(participants.length)}
            />
            <div className={styles.prizeBoard}>
              <span>Premio en juego</span>
              <strong>{prize || 'Sorteo Oficial Charros'}</strong>
            </div>
            <Metric
              label="Continúan elegibles"
              value={formatNumber(eligibleParticipants.length)}
              accent
            />
          </div>

          <div className={styles.wheelScene}>
            <div className={styles.pointer} aria-hidden="true">
              <span />
            </div>

            <div className={styles.wheelOuter}>
              <div
                className={`${styles.wheel} ${status === 'spinning' ? styles.wheelSpinning : ''}`}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transitionDuration: `${spinDuration}ms`
                }}
                aria-hidden="true"
              >
                <div className={styles.stitchRing} />
                <div className={styles.wheelLines} />
              </div>

              <button
                type="button"
                className={styles.wheelHub}
                onClick={runDraw}
                disabled={isBusy || eligibleParticipants.length === 0}
                aria-label={wheelButtonLabel}
              >
                <img src={logo} alt="" />
                <span>{isBusy ? 'GIRANDO' : 'GIRAR'}</span>
              </button>
            </div>

            {status === 'countdown' && (
              <div className={styles.countdown} aria-hidden="true">
                <span>{countdown}</span>
                <small>Prepárense</small>
              </div>
            )}
          </div>

          <div className={styles.nameTicker} aria-hidden={status === 'spinning'}>
            <span>
              {status === 'spinning'
                ? 'Buscando entre todos los participantes'
                : participants.length
                  ? `${formatNumber(eligibleParticipants.length)} oportunidades activas`
                  : 'Carga una base o inicia la demostración'}
            </span>
            <strong className={status === 'spinning' ? styles.tickerMoving : ''}>
              {displayName}
            </strong>
          </div>

          <div className={styles.securityStrip}>
            <span aria-hidden="true">◆</span>
            <p>
              Selección segura · Sin repeticiones · Datos procesados en este dispositivo
            </p>
            {rosterHash && <code title={rosterHash}>Huella {rosterHash.slice(0, 10)}…</code>}
          </div>

          {presentationMode && !isBusy && status !== 'winner' && (
            <button
              type="button"
              className={styles.presentationSpin}
              onClick={runDraw}
              disabled={eligibleParticipants.length === 0}
            >
              Iniciar sorteo
            </button>
          )}

          {winner && (
            <div className={styles.winnerOverlay} role="dialog" aria-modal="true" aria-labelledby="winner-title">
              <Confetti />
              <div className={styles.winnerCard}>
                <span className={styles.winnerEyebrow}>¡Tenemos ganador!</span>
                <div className={styles.winnerLogo}>
                  <img src={logo} alt="" />
                </div>
                <h2 id="winner-title" ref={winnerTitleRef} tabIndex="-1">
                  {winner.name}
                </h2>
                <div className={styles.winnerContact}>
                  <span>Correo del ganador</span>
                  <strong>{winner.email || 'Correo no disponible en la base'}</strong>
                </div>
                <p>{prize || 'Sorteo Oficial Charros'}</p>
                <div className={styles.winnerMeta}>
                  <span>Sorteo #{history.length}</span>
                  <span>Participación verificada</span>
                </div>
                <div className={styles.winnerActions}>
                  <button type="button" className={styles.primaryButton} onClick={continueDrawing}>
                    Continuar con el siguiente
                  </button>
                  <button type="button" onClick={exportHistory}>Exportar resultado</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className={styles.footerNote}>
        <span>Charros de Jalisco</span>
        <p>
          Operación local: esta pantalla no transmite ni almacena la base de participantes.
        </p>
      </footer>

      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {liveMessage}
      </p>
    </div>
  )
}
