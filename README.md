# Sickle Cell Web App — AlphaFold Viewer

This app provides an interactive in-browser 3D molecular viewer for AlphaFold outputs.

## What it does

- Shows a 3D protein structure using NGL (rotate, zoom, inspect)
- Loads a bundled sample model by default (`public/models/1AAY.pdb`)
- Links back to your AlphaFold result page:
  - `https://alphafoldserver.com/fold/54a0c496b62b0ab6`
- Lets you load a direct `.cif`/`.pdb` URL
- Lets you upload a downloaded AlphaFold structure file (`.cif`, `.mmcif`, `.pdb`, `.ent`)

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run build
```

## Deployment

Temporary Vercel deployment command (no login required):

```bash
npx vercel deploy --prod --yes --temporary
```

The deployment used in this session:

- https://temporary-spry-silicon-qlqgczz.vercel.app

> Note: temporary deployments expire. Claim the deployment in Vercel to keep it permanently.
