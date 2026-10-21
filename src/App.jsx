import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage } from 'ngl'
import './App.css'

const alphaFoldResultPage = 'https://alphafoldserver.com/fold/54a0c496b62b0ab6'
const fallbackModelUrl = '/models/1AAY.pdb'

const defaultCliffnotes = [
  'This structure shows a compact, folded protein with a clear three-dimensional arrangement.',
  'The shape suggests a stable tertiary structure rather than a loose or partially unfolded chain.',
  'Secondary-structure cues help explain how the molecule might bind or interact with partners in its biological context.',
]

function summarizeStructure(text, fileName = 'uploaded structure') {
  const normalizedText = text.replace(/\r/g, '')
  const lines = normalizedText.split('\n')
  const atomRecords = lines.filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'))
  const helixRecords = lines.filter((line) => line.startsWith('HELIX'))
  const sheetRecords = lines.filter((line) => line.startsWith('SHEET'))

  const chainSet = new Set()
  const residueSet = new Set()
  const elementCounts = {}

  atomRecords.forEach((line) => {
    const chain = (line.slice(21, 22) || '').trim() || 'A'
    const residueCode = `${chain}:${(line.slice(22, 27) || '').trim()}:${(line.slice(17, 20) || '').trim()}`
    const element = (line.slice(76, 78) || '').trim() || 'C'

    chainSet.add(chain)
    residueSet.add(residueCode)
    elementCounts[element] = (elementCounts[element] || 0) + 1
  })

  const atomCount = atomRecords.length
  const residueCount = residueSet.size
  const chainCount = chainSet.size
  const helixCount = helixRecords.length
  const sheetCount = sheetRecords.length

  const foldType =
    helixCount > 0 && sheetCount > 0
      ? 'mixed alpha/beta fold'
      : helixCount > 0
        ? 'helical fold'
        : sheetCount > 0
          ? 'beta-rich fold'
          : 'compact globular fold'

  const dominantElement = Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0]
  const elementLabel = dominantElement ? `${dominantElement[0]} atoms dominate` : 'carbon-rich scaffold'

  const insight =
    chainCount > 1
      ? 'This model includes multiple chains, so the arrangement likely reflects a multi-chain assembly or interaction surface.'
      : 'This model is a single-chain structure, indicating a folded unit with a clear internal architecture.'

  const structuralNote =
    helixCount > 0 && sheetCount > 0
      ? 'The molecule combines helices and strands, which is a classic sign of a structured, biologically active domain.'
      : helixCount > 0
        ? 'The structure is dominated by helical segments, suggesting a stable, tightly packed protein fold.'
        : sheetCount > 0
          ? 'The structure is sheet-heavy, which often points to extended beta architecture and rigid packing.'
          : 'The structure appears highly folded and compact, with geometry that favors a stable tertiary arrangement.'

  const bullets = [
    `${fileName}: ${atomCount} modeled atoms across ${chainCount} chain${chainCount === 1 ? '' : 's'} and ${residueCount} unique residue positions.`,
    `Fold profile: ${foldType}.`,
    `Secondary structure: ${helixCount} helix segment(s), ${sheetCount} sheet segment(s).`,
    `Structural cue: ${elementLabel}.`,
    `Class takeaway: ${insight}`,
    `Shareable explanation: ${structuralNote}`,
  ]

  return {
    title: 'Viewer cliffnotes',
    bullets,
    foldType,
    atomCount,
    residueCount,
    chainCount,
    helixCount,
    sheetCount,
  }
}

function App() {
  const viewportRef = useRef(null)
  const stageRef = useRef(null)
  const [structureUrl, setStructureUrl] = useState(fallbackModelUrl)
  const [status, setStatus] = useState('Loading default model...')
  const [cliffnotes, setCliffnotes] = useState(defaultCliffnotes)

  const updateCliffnotes = useCallback((text, fileLabel = 'uploaded structure') => {
    const summary = summarizeStructure(text, fileLabel)
    setCliffnotes(summary.bullets)
  }, [])

  const loadFromUrl = useCallback(
    async (url) => {
      if (!stageRef.current) {
        return
      }

      setStatus('Loading structure...')
      try {
        const stage = stageRef.current
        const extensionMatch = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i)
        const ext = extensionMatch?.[1]
        stage.removeAllComponents()
        const component = await stage.loadFile(url, ext ? { ext } : undefined)
        component.addRepresentation('cartoon', { colorScheme: 'bfactor' })
        component.addRepresentation('ball+stick', { sele: 'hetero and not water' })
        component.autoView()

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('Could not fetch structure text for summary')
        }

        const text = await response.text()
        updateCliffnotes(text, url)
        setStatus(`Loaded structure: ${url}`)
      } catch {
        setStatus(
          'Could not load structure URL. Make sure it is a direct .cif/.pdb file and has public access.',
        )
      }
    },
    [updateCliffnotes],
  )

  const loadFromFile = useCallback(
    async (file) => {
      if (!stageRef.current || !file) {
        return
      }

      setStatus(`Loading file: ${file.name}...`)
      try {
        const stage = stageRef.current
        stage.removeAllComponents()
        const component = await stage.loadFile(file, { ext: file.name.split('.').pop() })
        component.addRepresentation('cartoon', { colorScheme: 'bfactor' })
        component.addRepresentation('ball+stick', { sele: 'hetero and not water' })
        component.autoView()

        const text = await file.text()
        updateCliffnotes(text, file.name)
        setStatus(`Loaded file: ${file.name}`)
      } catch {
        setStatus('Could not parse the uploaded structure file.')
      }
    },
    [updateCliffnotes],
  )

  useEffect(() => {
    if (!viewportRef.current) {
      return
    }

    const stage = new Stage(viewportRef.current, { backgroundColor: 'black' })
    stageRef.current = stage
    void loadFromUrl(fallbackModelUrl)

    const onResize = () => {
      stage.handleResize()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      stage.dispose()
      stageRef.current = null
    }
  }, [loadFromUrl])

  useEffect(() => {
    const loadDefaultSummary = async () => {
      try {
        const response = await fetch(fallbackModelUrl)
        if (response.ok) {
          const text = await response.text()
          updateCliffnotes(text, 'default sample structure')
        }
      } catch {
        setCliffnotes(defaultCliffnotes)
      }
    }

    void loadDefaultSummary()
  }, [updateCliffnotes])

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">Sickle Cell Web App</p>
        <h1>AlphaFold 3D Result Viewer</h1>
        <p className="subtitle">
          Original AlphaFold results page:
          <a href={alphaFoldResultPage} target="_blank" rel="noreferrer">
            {' '}
            {alphaFoldResultPage}
          </a>
        </p>
      </header>

      <section className="controls" aria-label="Model loading controls">
        <label htmlFor="structure-url">Load from direct structure URL (.cif or .pdb)</label>
        <div className="control-row">
          <input
            id="structure-url"
            type="url"
            value={structureUrl}
            onChange={(event) => setStructureUrl(event.target.value)}
            placeholder="https://.../result.cif"
          />
          <button type="button" onClick={() => void loadFromUrl(structureUrl)}>
            Load URL
          </button>
        </div>

        <label htmlFor="structure-file">Or upload a downloaded AlphaFold structure file</label>
        <input
          id="structure-file"
          type="file"
          accept=".pdb,.cif,.mmcif,.ent"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void loadFromFile(file)
            }
          }}
        />

        <p className="status">{status}</p>
      </section>

      <section className="viewer-card" aria-label="AlphaFold 3D viewer">
        <div ref={viewportRef} className="viewer-frame" />
      </section>

      <section className="analysis-card" aria-label="Structure analysis and class notes">
        <h2>Viewer cliffnotes for class</h2>
        <ul>
          {cliffnotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="notes" aria-label="Usage notes">
        <h2>How to present at your MVP session</h2>
        <ol>
          <li>Rotate/zoom the structure directly in the in-app 3D viewer.</li>
          <li>If your fold page is private, download the structure and upload it here.</li>
          <li>Use the viewer cliffnotes above as a short class-ready explanation.</li>
        </ol>
      </section>
    </main>
  )
}

export default App
