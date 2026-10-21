import { Selection } from 'ngl'

// Sequence fingerprints for globin chains. The residue at index 4 of the beta
// motifs is position 6 of beta-globin, the site of the sickle cell mutation.
const betaVariants = [
  { pattern: 'HLTPEEK', variant: 'normal', residue: 'Glu', label: 'normal adult beta-globin (HbA)' },
  { pattern: 'HLTPVEK', variant: 'sickle', residue: 'Val', label: 'sickle beta-globin (HbS, Glu6Val)' },
  { pattern: 'HLTPKEK', variant: 'hbc', residue: 'Lys', label: 'HbC beta-globin (Glu6Lys)' },
]
const alphaPattern = 'LSPADK'
const gammaPattern = 'HFTEEDK'

const ligandNames = {
  HEM: 'heme (the iron-containing group that binds oxygen)',
  HEC: 'heme C',
  OXY: 'bound oxygen',
  O2: 'bound oxygen',
  CMO: 'carbon monoxide',
  FE: 'iron ions',
  FE2: 'iron ions',
  ZN: 'zinc ions',
  MG: 'magnesium ions',
  CA: 'calcium ions',
  NA: 'sodium ions',
  CL: 'chloride ions',
  SO4: 'sulfate (from the crystallization buffer)',
  PO4: 'phosphate',
  GOL: 'glycerol (from the crystallization buffer)',
  NAG: 'sugar (N-acetylglucosamine)',
  '2BP': '2,3-bisphosphoglycerate',
  DPG: '2,3-bisphosphoglycerate',
}

const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

function chainKind(residues) {
  if (residues.some((r) => r.protein)) return 'protein'
  if (residues.some((r) => r.dna)) return 'DNA'
  if (residues.some((r) => r.rna)) return 'RNA'
  return 'other'
}

function identifyGlobin(sequence, residues) {
  for (const beta of betaVariants) {
    const index = sequence.indexOf(beta.pattern)
    if (index !== -1) {
      return { type: 'beta', ...beta, resno: residues[index + 4].resno }
    }
  }
  if (sequence.includes(gammaPattern)) return { type: 'gamma', label: 'fetal gamma-globin (HbF)' }
  if (sequence.includes(alphaPattern)) return { type: 'alpha', label: 'alpha-globin' }
  return null
}

export function analyzeStructure(structure, sourceLabel) {
  const firstModel = new Selection('/0')
  const chains = new Map()
  const ligands = {}
  let waterCount = 0

  structure.eachResidue((rp) => {
    if (rp.isWater()) {
      waterCount += 1
      return
    }
    if (!rp.isPolymer()) {
      ligands[rp.resname] = (ligands[rp.resname] || 0) + 1
      return
    }
    if (!chains.has(rp.chainname)) chains.set(rp.chainname, [])
    chains.get(rp.chainname).push({
      resno: rp.resno,
      resname: rp.resname,
      code: rp.getResname1(),
      sstruc: rp.sstruc,
      protein: rp.isProtein(),
      dna: rp.isDna(),
      rna: rp.isRna(),
    })
  }, firstModel)

  const chainList = [...chains.entries()].map(([name, residues]) => {
    const sequence = residues.map((r) => r.code).join('')
    return {
      name,
      kind: chainKind(residues),
      length: residues.length,
      residues,
      globin: identifyGlobin(sequence, residues),
    }
  })

  const proteinResidues = chainList.filter((c) => c.kind === 'protein').flatMap((c) => c.residues)
  const helixResidues = proteinResidues.filter((r) => 'hgi'.includes(r.sstruc) && r.sstruc).length
  const strandResidues = proteinResidues.filter((r) => 'eb'.includes(r.sstruc) && r.sstruc).length

  const caScores = []
  structure.eachAtom((ap) => caScores.push(ap.bfactor), new Selection('/0 and protein and .CA'))
  const meanScore = caScores.length ? caScores.reduce((a, b) => a + b, 0) / caScores.length : 0

  const isAlphaFold = /alphafold|fold_|af-/i.test(`${sourceLabel} ${structure.title || ''}`)
  const plddt = isAlphaFold
    ? {
        veryHigh: percent(caScores.filter((s) => s > 90).length, caScores.length),
        confident: percent(caScores.filter((s) => s > 70 && s <= 90).length, caScores.length),
        low: percent(caScores.filter((s) => s <= 70).length, caScores.length),
      }
    : null

  return {
    title: structure.title || '',
    sourceLabel,
    chains: chainList,
    proteinResidueCount: proteinResidues.length,
    helixPercent: percent(helixResidues, proteinResidues.length),
    strandPercent: percent(strandResidues, proteinResidues.length),
    ligands,
    waterCount,
    meanScore,
    isAlphaFold,
    plddt,
    betaChains: chainList.filter((c) => c.globin?.type === 'beta'),
    alphaChains: chainList.filter((c) => c.globin?.type === 'alpha'),
    gammaChains: chainList.filter((c) => c.globin?.type === 'gamma'),
  }
}

// Selection string highlighting residue 6 on every beta chain, or null.
export function mutationSelection(analysis) {
  if (!analysis.betaChains.length) return null
  return analysis.betaChains.map((c) => `${c.globin.resno}:${c.name}`).join(' or ')
}

function describeChains(analysis) {
  return analysis.chains
    .map((c) => {
      const what = c.globin ? c.globin.label : `${c.kind} chain`
      return `chain ${c.name} (${what}, ${c.length} residues)`
    })
    .join('; ')
}

function describeLigands(analysis) {
  const entries = Object.entries(analysis.ligands)
  if (!entries.length) return null
  return entries
    .map(([code, count]) => `${count}× ${code}${ligandNames[code] ? ` — ${ligandNames[code]}` : ''}`)
    .join('; ')
}

export function buildNotes(analysis) {
  const { chains, betaChains, alphaChains, gammaChains } = analysis
  const isHemoglobin = betaChains.length + alphaChains.length + gammaChains.length > 0
  const sickle = betaChains.find((c) => c.globin.variant === 'sickle')
  const normal = betaChains.find((c) => c.globin.variant === 'normal')
  const hemeCount = analysis.ligands.HEM || 0
  const tetramers = Math.floor(Math.min(alphaChains.length, betaChains.length + gammaChains.length) / 2)
  const ligandText = describeLigands(analysis)
  const name = sickle
    ? 'sickle cell hemoglobin, or HbS'
    : normal
      ? 'normal adult hemoglobin, or HbA'
      : analysis.title
        ? analysis.title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
        : 'this structure'

  const stats = [
    { label: 'Chains', value: chains.length },
    { label: 'Protein residues', value: analysis.proteinResidueCount },
    { label: 'Helix', value: `${analysis.helixPercent}%` },
    { label: 'Strand', value: `${analysis.strandPercent}%` },
    analysis.isAlphaFold
      ? { label: 'Mean pLDDT', value: analysis.meanScore.toFixed(1) }
      : { label: 'Ligand groups', value: Object.values(analysis.ligands).reduce((a, b) => a + b, 0) },
  ]

  // ---- Cliff notes: dense, factual bullets about the loaded model ----
  const cliffnotes = []
  cliffnotes.push(
    `What it is: ${analysis.title ? `"${analysis.title}"` : analysis.sourceLabel}. It contains ${plural(chains.length, 'polymer chain')}: ${describeChains(analysis)}.`,
  )
  if (isHemoglobin) {
    cliffnotes.push(
      tetramers > 1
        ? `Assembly: ${plural(tetramers, 'hemoglobin tetramer')} (each tetramer = 2 alpha + 2 beta chains). Multiple copies sit side by side in the crystal, so you can see how neighbouring molecules touch.`
        : 'Assembly: hemoglobin is a tetramer — 2 alpha + 2 beta chains — that carries oxygen inside red blood cells.',
    )
  }
  cliffnotes.push(
    `Fold: ${analysis.helixPercent}% of protein residues are in helices and ${analysis.strandPercent}% in beta strands${
      isHemoglobin
        ? ' — the classic all-alpha "globin fold" of 8 helices (A–H) wrapped around a heme pocket.'
        : analysis.helixPercent > 50
          ? ', so this is a mostly helical protein.'
          : analysis.strandPercent > 30
            ? ', so beta sheets make up a big part of the structure.'
            : ', a mix of helices, strands and loops.'
    }`,
  )
  if (ligandText) cliffnotes.push(`Bound molecules: ${ligandText}.`)
  if (hemeCount) {
    cliffnotes.push(
      `Oxygen binding: each globin chain holds one heme; the iron at its centre binds one O₂, so one tetramer carries up to 4 O₂ molecules.`,
    )
  }
  if (sickle) {
    cliffnotes.push(
      `The mutation: β chain${betaChains.length > 1 ? 's' : ''} ${betaChains.map((c) => c.name).join(', ')} carry Val at position ${sickle.globin.resno} instead of Glu. That single swap (codon GAG→GTG in the HBB gene) is what causes sickle cell disease.`,
      'Why it matters structurally: Glu is charged and water-loving; Val is hydrophobic. On the protein surface, Val6 acts as a "sticky patch" that fits into a hydrophobic pocket (around Phe85/Leu88) on a neighbouring deoxygenated hemoglobin.',
      'Result: when oxygen is released, HbS molecules stick together into long polymer fibres that stretch red blood cells into the sickle shape.',
    )
  } else if (normal) {
    cliffnotes.push(
      `Key site: β chain${betaChains.length > 1 ? 's' : ''} ${betaChains.map((c) => c.name).join(', ')} have the normal Glu at position ${normal.globin.resno}. In sickle cell disease this exact residue becomes Val (Glu6Val), which makes hemoglobin molecules stick together.`,
    )
  } else if (betaChains.length) {
    cliffnotes.push(
      `Variant: ${betaChains[0].globin.label} — position ${betaChains[0].globin.resno} is ${betaChains[0].globin.residue} instead of the normal Glu.`,
    )
  }
  if (gammaChains.length) {
    cliffnotes.push(
      'Fetal hemoglobin: gamma chains replace beta chains in HbF, which does not sickle — that is why treatments like hydroxyurea aim to raise HbF levels.',
    )
  }
  if (analysis.isAlphaFold && analysis.plddt) {
    cliffnotes.push(
      `Model confidence (pLDDT, 0–100): mean ${analysis.meanScore.toFixed(1)}. ${analysis.plddt.veryHigh}% of residues are very high (>90), ${analysis.plddt.confident}% confident (70–90), ${analysis.plddt.low}% low (≤70). The cartoon is coloured by this score.`,
    )
  } else {
    cliffnotes.push(
      `Data source: an experimental structure. The cartoon colour shows the B-factor (atomic "wobble") — warmer colours mark more flexible regions${analysis.waterCount ? `; ${analysis.waterCount} water molecules were also resolved` : ''}.`,
    )
  }
  if (!isHemoglobin) {
    cliffnotes.push(
      'Heads-up: no hemoglobin chains were detected in this model, so it does not show the sickle cell mutation. Load an HbS or HBB-based AlphaFold model to discuss the disease directly.',
    )
  }

  // ---- Talking points: what to say + what to do in the viewer ----
  const talkingPoints = []
  talkingPoints.push({
    heading: 'Open with the hook',
    say: isHemoglobin
      ? 'Sickle cell disease comes down to one letter in one gene. Today I will show you exactly where that letter lands on the hemoglobin protein — in 3D.'
      : `This is ${name}. I will walk through what the structure is, how it is folded, and what we can learn from looking at it in 3D.`,
    show: 'Let the model spin slowly; zoom out so the whole molecule is visible.',
  })
  talkingPoints.push({
    heading: 'Explain what is on screen',
    say: isHemoglobin
      ? `This is ${name}. Each coloured ribbon is a protein chain — ${alphaChains.length} alpha and ${betaChains.length + gammaChains.length} ${gammaChains.length ? 'gamma' : 'beta'} chains here. Together, 2 alpha and 2 beta chains make one hemoglobin molecule, the protein that carries oxygen in red blood cells.`
      : `The ribbons are the protein backbone. This model has ${plural(chains.length, 'chain')}: ${describeChains(analysis)}.`,
    show: 'Rotate to show the chains packing against each other.',
  })
  talkingPoints.push({
    heading: 'Point out the shape',
    say: isHemoglobin
      ? `About ${analysis.helixPercent}% of the protein is alpha helix — those coiled ribbons. Each chain folds into 8 helices that cradle a heme group, the small ring with iron at its centre that grabs oxygen.`
      : `About ${analysis.helixPercent}% of the residues are helices and ${analysis.strandPercent}% are beta strands. That ratio tells us what kind of fold this is.`,
    show: hemeCount ? 'Zoom in on one of the stick-model hemes tucked inside a chain.' : 'Trace one helix with the cursor.',
  })
  if (sickle || normal) {
    const site = (sickle || normal).globin.resno
    talkingPoints.push({
      heading: 'Land the key point: residue 6',
      say: sickle
        ? `Here is the mutation, highlighted in red: position ${site} on the beta chain is valine instead of glutamic acid. Glutamic acid is charged and likes water; valine is oily and hydrophobic. That turns this spot on the surface into a sticky patch.`
        : `Highlighted in red is position ${site} on the beta chain — a glutamic acid in normal hemoglobin. In sickle cell disease, a single DNA change swaps it for valine, an oily, hydrophobic amino acid.`,
      show: 'Zoom to the red labelled residue near the start of a beta chain; note it sits on the outside of the protein.',
    })
    talkingPoints.push({
      heading: 'Connect structure to disease',
      say: 'When hemoglobin lets go of oxygen, that sticky valine fits into a pocket on the next hemoglobin molecule. They link up into long fibres, the fibres bend the red blood cell into a sickle shape, and those stiff cells block small blood vessels — causing pain crises, organ damage, and anemia.',
      show: tetramers > 1 ? 'Show how neighbouring tetramers sit next to each other in this crystal.' : 'Gesture at the surface where a second molecule would dock.',
    })
  } else {
    talkingPoints.push({
      heading: 'Highlight a notable feature',
      say: ligandText
        ? `The stick models are bound molecules: ${ligandText}. These often tell us what the protein does.`
        : `This is a single folded unit. Its compact shape suggests a stable structure that keeps its form in the cell.`,
      show: 'Zoom in on the stick-model ligands, if present.',
    })
  }
  talkingPoints.push({
    heading: analysis.isAlphaFold ? 'Address model confidence' : 'Where the data comes from',
    say: analysis.isAlphaFold
      ? `This is an AlphaFold prediction, not an experiment. AlphaFold scores its confidence per residue; the average here is ${analysis.meanScore.toFixed(0)} out of 100, and ${analysis.plddt.veryHigh + analysis.plddt.confident}% of residues score above 70, which is generally considered reliable.`
      : 'This structure was measured experimentally (for example by X-ray crystallography), so the atom positions come from real data, not a prediction. The colours show which parts move the most.',
    show: 'Point to the warm vs. cool colours on the cartoon.',
  })
  talkingPoints.push({
    heading: 'Close with why it matters',
    say: isHemoglobin
      ? 'Seeing the structure explains the treatments: hydroxyurea boosts fetal hemoglobin, which does not sickle, and the newest gene therapies — like the CRISPR-based Casgevy — switch fetal hemoglobin back on. One amino acid, one sticky patch, one disease.'
      : 'Visualising structures like this helps scientists understand how proteins work and design drugs that target them.',
    show: 'Zoom back out to the full structure.',
  })

  const exampleScript = talkingPoints.map((p) => p.say).join(' ')

  return { stats, cliffnotes, talkingPoints, exampleScript, isHemoglobin }
}

export const sickleCellBackground = [
  'Gene: HBB on chromosome 11 encodes beta-globin. Sickle cell disease is caused by one point mutation (GAG→GTG) that swaps glutamic acid for valine at position 6 (Glu6Val, written E6V; some newer references number it E7V).',
  'Inheritance: autosomal recessive. Two copies (HbSS) → sickle cell disease; one copy (HbAS) → sickle cell trait, usually without symptoms.',
  'Mechanism: deoxygenated HbS polymerises into stiff fibres → red cells sickle → cells block small vessels (vaso-occlusion) and break down early (hemolysis, lifespan ~10–20 days vs. ~120).',
  'Symptoms: pain crises, anemia, fatigue, infections, acute chest syndrome, stroke risk, organ damage.',
  'Who is affected: about 100,000 people in the U.S. and millions worldwide, most commonly people with ancestry from sub-Saharan Africa, the Middle East, India, and the Mediterranean.',
  'Malaria link: sickle cell trait protects against severe malaria, which is why the allele became common where malaria is endemic.',
  'Treatments: hydroxyurea (raises fetal hemoglobin), L-glutamine, crizanlizumab, blood transfusions, and bone-marrow transplant. In Dec 2023 the FDA approved two gene therapies: Casgevy (CRISPR) and Lyfgenia.',
]
