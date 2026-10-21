import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage } from 'ngl'
import './App.css'
import { analyzeStructure, buildNotes, mutationSelection, sickleCellBackground } from './notes'

const alphaFoldResultPage = 'https://alphafoldserver.com/fold/54a0c496b62b0ab6'
const fallbackModelUrl = '/models/2HBS.pdb'

function addRepresentations(component, analysis) {
  component.addRepresentation('cartoon', { colorScheme: 'bfactor' })
  component.addRepresentation('ball+stick', { sele: 'hetero and not water' })

  const mutationSele = mutationSelection(analysis)
  if (mutationSele) {
    component.addRepresentation('ball+stick', { sele: mutationSele, color: 'red', radiusScale: 2 })
    component.addRepresentation('label', {
      sele: `(${mutationSele}) and .CA`,
      labelType: 'res',
      color: 'white',
      zOffset: 2,
      fixedSize: true,
      radiusScale: 1.2,
    })
  }
  component.autoView()
}

function App() {
  const viewportRef = useRef(null)
  const stageRef = useRef(null)
  const [structureUrl, setStructureUrl] = useState(fallbackModelUrl)
  const [status, setStatus] = useState('Loading default model...')
  const [notes, setNotes] = useState(null)
  const [copied, setCopied] = useState(false)

  const loadStructure = useCallback(async (source, label, ext) => {
    if (!stageRef.current) {
      return false
    }
    const stage = stageRef.current
    stage.removeAllComponents()
    const component = await stage.loadFile(source, ext ? { ext } : undefined)
    const analysis = analyzeStructure(component.structure, label)
    addRepresentations(component, analysis)
    setNotes(buildNotes(analysis))
    setCopied(false)
    return true
  }, [])

  const loadFromUrl = useCallback(
    async (url) => {
      setStatus('Loading structure...')
      try {
        const ext = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i)?.[1]
        if (await loadStructure(url, url, ext)) {
          setStatus(`Loaded structure: ${url}`)
        }
      } catch {
        setStatus(
          'Could not load structure URL. Make sure it is a direct .cif/.pdb file and has public access.',
        )
      }
    },
    [loadStructure],
  )

  const loadFromFile = useCallback(
    async (file) => {
      setStatus(`Loading file: ${file.name}...`)
      try {
        if (await loadStructure(file, file.name, file.name.split('.').pop())) {
          setStatus(`Loaded file: ${file.name}`)
        }
      } catch {
        setStatus('Could not parse the uploaded structure file.')
      }
    },
    [loadStructure],
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

  const copyTalkingPoints = async () => {
    if (!notes) return
    const text = [
      'TALKING POINTS',
      ...notes.talkingPoints.map((p, i) => `${i + 1}. ${p.heading}\n   Say: ${p.say}\n   Show: ${p.show}`),
      '',
      'EXAMPLE SCRIPT',
      notes.exampleScript,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

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
      {notes?.isHemoglobin && (
        <p className="legend">
          <span className="swatch" /> Red sticks = beta-globin residue 6, the sickle cell mutation site.
        </p>
      )}

      {notes && (
        <>
          <section className="stats" aria-label="Structure at a glance">
            {notes.stats.map((stat) => (
              <div className="stat" key={stat.label}>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </section>

          <section className="analysis-card" aria-label="Structure cliff notes">
            <h2>Cliff notes: this structure</h2>
            <ul>
              {notes.cliffnotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          <section className="analysis-card" aria-label="Talking points">
            <div className="section-head">
              <h2>Talking points</h2>
              <button type="button" onClick={() => void copyTalkingPoints()}>
                {copied ? 'Copied!' : 'Copy talking points'}
              </button>
            </div>
            <ol className="talking-points">
              {notes.talkingPoints.map((point) => (
                <li key={point.heading}>
                  <strong>{point.heading}</strong>
                  <p>
                    <span className="tag">Say</span> “{point.say}”
                  </p>
                  <p>
                    <span className="tag tag-show">Show</span> {point.show}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="analysis-card" aria-label="Example script">
            <h2>Example script (about 90 seconds)</h2>
            <blockquote className="script">{notes.exampleScript}</blockquote>
          </section>
        </>
      )}

      <section className="analysis-card" aria-label="Sickle cell background">
        <h2>Cliff notes: sickle cell disease background</h2>
        <ul>
          {sickleCellBackground.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="notes" aria-label="Usage notes">
        <h2>How to present at your MVP session</h2>
        <ol>
          <li>Rotate/zoom the structure directly in the in-app 3D viewer.</li>
          <li>If your fold page is private, download the structure and upload it here.</li>
          <li>Walk through the talking points in order — each one says what to say and what to show.</li>
          <li>Use the example script as a rehearsal guide, then put it in your own words.</li>
        </ol>
      </section>
    </main>
  )
}

export default App
